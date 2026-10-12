import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  type CreateAgentSessionOptions,
} from "@earendil-works/pi-coding-agent";
import type { CliOptions } from "../cli/options.ts";
import { customTools } from "../tools/index.ts";

export function sessionDirectory(cwd: string, home = homedir()) {
  const key = createHash("sha256").update(cwd).digest("hex");
  return join(home, ".my-agent", "sessions", key);
}

export async function openSession(
  options: CliOptions,
  modelRuntime: ModelRuntime,
  overrides: Partial<CreateAgentSessionOptions> = {},
) {
  const cwd = await realpath(options.cwd);
  if (!(await stat(cwd)).isDirectory()) throw new Error(`不是目录：${cwd}`);
  const model = options.provider && options.model
    ? modelRuntime.getModel(options.provider, options.model)
    : undefined;
  if (options.model && !model) {
    throw new Error(`找不到模型 ${options.provider}/${options.model}，请运行 --list-models。`);
  }
  const directory = sessionDirectory(cwd);
  const result = await createAgentSession({
    cwd,
    modelRuntime,
    model,
    sessionManager: overrides.sessionManager ?? (options.continue
      ? SessionManager.continueRecent(cwd, directory)
      : SessionManager.create(cwd, directory)),
    customTools,
    ...overrides,
  });
  try {
    if (!result.session.model) {
      throw new Error("没有可用模型。请设置提供商 API Key，或运行 npm run pi 并使用 /login 登录。");
    }
    await result.session.bindExtensions({});
    return { ...result, cwd };
  } catch (error) {
    result.session.dispose();
    throw error;
  }
}
