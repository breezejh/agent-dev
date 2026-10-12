#!/usr/bin/env node
import { createInterface } from "node:readline";
import { stripVTControlCharacters } from "node:util";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { help, parseOptions } from "./cli/options.ts";
import { renderEvent } from "./cli/render.ts";
import { openSession } from "./runtime/session.ts";

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(help);
    return;
  }
  if (!options["list-models"] && options.prompt === undefined && !process.stdin.isTTY) {
    throw new Error("非交互环境请使用 --prompt 指定任务。");
  }
  const modelRuntime = await ModelRuntime.create();
  if (options["list-models"]) {
    const models = await modelRuntime.getAvailable();
    for (const model of models) console.log(`${model.provider}\t${model.id}`);
    if (!models.length) console.log("尚未配置模型凭据。设置 API Key 或运行 npm run pi 后 /login。");
    return;
  }

  const { session, cwd, modelFallbackMessage, extensionsResult } = await openSession(options, modelRuntime);
  const unsubscribe = session.subscribe((event) => renderEvent(event, (text) => process.stdout.write(text)));
  const info = () => console.log(`\n工作目录：${cwd}\n模型：${session.model?.provider}/${session.model?.id}\n会话：${session.sessionFile}`);
  const prompt = async (text: string) => {
    await session.prompt(text);
    console.log();
    if (session.state.errorMessage) throw new Error(session.state.errorMessage);
  };

  try {
    if (modelFallbackMessage) console.error(modelFallbackMessage);
    for (const error of extensionsResult.errors) console.error("扩展加载失败：", error.error);
    if (options.prompt !== undefined) {
      const cancel = () => { void session.abort().catch(reportError); };
      process.on("SIGINT", cancel);
      try { await prompt(options.prompt); } finally { process.off("SIGINT", cancel); }
      return;
    }

    info();
    console.log("输入任务；/help 查看命令。Ctrl+C 取消当前任务，空闲时退出。");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let active: Promise<void> | undefined;
    let closed = false;
    const showPrompt = () => { if (!closed) { rl.setPrompt("\n你 > "); rl.prompt(); } };
    const stop = () => {
      if (active) void session.abort().catch(reportError);
      else rl.close();
    };
    process.on("SIGINT", stop);
    rl.on("SIGINT", stop);
    rl.on("line", (line) => {
      const text = line.trim();
      if (active) {
        console.log("任务正在执行，请等待，或按 Ctrl+C 取消。");
        return;
      }
      if (text === "/exit") { rl.close(); return; }
      if (text === "/help") console.log(help);
      else if (text === "/session") info();
      else if (text) {
        active = prompt(text).catch(reportError).finally(() => { active = undefined; showPrompt(); });
        return;
      }
      showPrompt();
    });
    try {
      await new Promise<void>((resolve) => {
        rl.once("close", () => { closed = true; resolve(); });
        showPrompt();
      });
      await session.abort();
      await active;
    } finally {
      process.off("SIGINT", stop);
      rl.close();
    }
  } finally {
    unsubscribe();
    session.dispose();
  }
}

function reportError(error: unknown) {
  console.error(`\n错误：${stripVTControlCharacters(error instanceof Error ? error.message : String(error))}`);
}

main().catch((error) => { reportError(error); process.exitCode = 1; });
