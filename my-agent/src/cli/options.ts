import { parseArgs } from "node:util";
import { resolve } from "node:path";

export function parseOptions(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      cwd: { type: "string", default: process.cwd() },
      continue: { type: "boolean", default: false },
      provider: { type: "string" },
      model: { type: "string" },
      prompt: { type: "string", short: "p" },
      "list-models": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (!values.help && Boolean(values.provider) !== Boolean(values.model)) {
    throw new Error("--provider 与 --model 必须一起指定。");
  }
  return { ...values, cwd: resolve(values.cwd) };
}

export type CliOptions = ReturnType<typeof parseOptions>;

export const help = `my-agent — 基于本地 Pi SDK 的编程助手

用法：npm start -- [选项]
  --cwd <目录>                 工作目录，默认当前目录
  --continue                   恢复该目录最近的 my-agent 会话
  --provider <名称> --model <ID> 指定模型（省略时使用 Pi 配置）
  --list-models                列出已配置凭据的可用模型
  -p, --prompt <任务>          执行单次任务后退出
  -h, --help                   显示帮助

交互命令：/help、/session、/exit
Ctrl+C：运行中取消任务，空闲时退出。
`;
