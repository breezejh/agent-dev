import { stripVTControlCharacters } from "node:util";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

export function renderEvent(event: AgentSessionEvent, write: (text: string) => void) {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    write(stripVTControlCharacters(event.assistantMessageEvent.delta));
  } else if (event.type === "tool_execution_start") {
    write(`\n[工具开始] ${event.toolName}\n`);
  } else if (event.type === "tool_execution_end") {
    write(`\n[工具${event.isError ? "失败" : "完成"}] ${event.toolName}\n`);
  } else if (event.type === "compaction_start") {
    write("\n[正在压缩上下文]\n");
  } else if (event.type === "auto_retry_start") {
    write("\n[请求失败，Pi 正在重试]\n");
  }
}
