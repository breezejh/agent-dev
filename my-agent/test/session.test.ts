import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import {
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { parseOptions } from "../src/cli/options.ts";
import { renderEvent } from "../src/cli/render.ts";
import { openSession, sessionDirectory } from "../src/runtime/session.ts";

test("CLI rejects incomplete model selection and unknown flags", () => {
  assert.throws(() => parseOptions(["--provider", "anthropic"]), /必须一起/);
  assert.throws(() => parseOptions(["--wrong"]));
  assert.equal(parseOptions(["--continue", "-p", "hello"]).continue, true);
  assert.notEqual(sessionDirectory("/a"), sessionDirectory("/b"));
});

test("real SDK reads, edits, executes commands, streams and restores a session", async () => {
  const dir = await mkdtemp(join(tmpdir(), "my-agent-test-"));
  const storage = join(dir, "sessions");
  const faux = createFauxCore({ tokensPerSecond: Infinity });
  const model = faux.getModel();
  const runtime = await ModelRuntime.create({
    authPath: join(dir, "auth.json"), modelsPath: join(dir, "models.json"), refreshOnCreate: false,
  });
  runtime.registerProvider(model.provider, {
    api: faux.api, baseUrl: model.baseUrl, apiKey: "test-only",
    streamSimple: faux.streamSimple,
    models: [{ ...model, type: "chat" }],
  });
  const settings = SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } });
  const loader = new DefaultResourceLoader({
    cwd: dir, agentDir: join(dir, "config"), settingsManager: settings,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
  });
  await loader.reload();
  const options = parseOptions(["--cwd", dir, "--provider", model.provider, "--model", model.id]);
  const overrides = { settingsManager: settings, resourceLoader: loader, tools: ["read", "write", "edit", "bash"] };
  let current: Awaited<ReturnType<typeof openSession>> | undefined;
  try {
    await writeFile(join(dir, "hello.txt"), "before\n");
    current = await openSession(options, runtime, {
      ...overrides, sessionManager: SessionManager.create(dir, storage),
    });
    let output = "";
    current.session.subscribe((event) => renderEvent(event, (text) => { output += text; }));
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("read", { path: "hello.txt" }), { stopReason: "toolUse" }),
      fauxAssistantMessage(fauxToolCall("edit", { path: "hello.txt", oldText: "before", newText: "after" }), { stopReason: "toolUse" }),
      fauxAssistantMessage(fauxToolCall("bash", { command: "cat hello.txt" }), { stopReason: "toolUse" }),
      fauxAssistantMessage("修改完成"),
    ]);
    await current.session.prompt("修改文件并检查结果");
    assert.equal(current.session.state.errorMessage, undefined);
    assert.equal(await readFile(join(dir, "hello.txt"), "utf8"), "after\n");
    assert.match(output, /修改完成/);
    assert.match(output, /工具完成.*edit/);
    assert.match(output, /工具完成.*bash/);
    assert.doesNotMatch(output, /工具失败/);
    const id = current.session.sessionId;
    current.session.dispose();
    current = await openSession({ ...options, continue: true }, runtime, {
      ...overrides, sessionManager: SessionManager.continueRecent(dir, storage),
    });
    assert.equal(current.session.sessionId, id);
    assert.equal(current.session.getLastAssistantText(), "修改完成");

    // Cancel a real SDK run while a tool is executing, then reuse the session.
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("bash", { command: "sleep 30" }), { stopReason: "toolUse" }),
    ]);
    const runningSession = current.session;
    const unsubscribe = runningSession.subscribe((event) => {
      if (event.type === "tool_execution_start") {
        setTimeout(() => { void runningSession.abort(); }, 50);
      }
    });
    const start = Date.now();
    await runningSession.prompt("等待任务");
    unsubscribe();
    assert.ok(Date.now() - start < 10_000, "abort should cancel the running command");
    assert.equal(runningSession.isStreaming, false);
    faux.setResponses([fauxAssistantMessage("可以继续")]);
    await runningSession.prompt("继续对话");
    assert.equal(runningSession.getLastAssistantText(), "可以继续");
  } finally {
    current?.session.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
