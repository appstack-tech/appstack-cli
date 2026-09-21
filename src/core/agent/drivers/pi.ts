import type { AgentDriver, AgentOptions, AgentResult } from "../types";
import { extractStatus, onPath, spawnFailure, spawnLines } from "../spawn";

export function piTools(options: AgentOptions): string[] {
  const tools = ["read", "grep", "find", "ls"];
  if (options.capabilities.filesystem === "write") {
    tools.push(process.platform === "win32" ? "powershell" : "bash", "edit", "write");
  }
  return tools;
}

export function piArgs(options: AgentOptions): string[] {
  return [
    "--mode",
    "json",
    "--no-session",
    "--no-approve",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--tools",
    piTools(options).join(","),
    options.prompt,
  ];
}

function messageText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const message = value as { role?: unknown; content?: unknown };
  if (message.role !== "assistant" || !Array.isArray(message.content)) return undefined;
  const parts = message.content.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const block = part as { type?: unknown; text?: unknown };
    return block.type === "text" && typeof block.text === "string" ? [block.text] : [];
  });
  return parts.join("\n").trim() || undefined;
}

export const piDriver: AgentDriver = {
  id: "pi",
  displayName: "Pi",
  detect: () => onPath("pi"),
  async run(options): Promise<AgentResult> {
    let finalText: string | undefined;
    let statusBuffer = "";
    let lastStatus: string | undefined;
    const sensitiveValues = [
      options.env?.APPSTACK_API_KEY ?? "",
      options.env?.APPSTACK_IOS_API_KEY ?? "",
      options.env?.APPSTACK_ANDROID_API_KEY ?? "",
    ];
    const execution = await spawnLines({
      bin: "pi",
      args: piArgs(options),
      cwd: options.cwd,
      env: options.env,
      sensitiveValues,
      onStdout(line) {
        try {
          const event = JSON.parse(line) as {
            type?: string;
            message?: unknown;
            assistantMessageEvent?: { type?: unknown; delta?: unknown };
          };
          if (event.type === "message_end") {
            finalText = messageText(event.message) ?? finalText;
          }
          const delta = event.assistantMessageEvent?.delta;
          if (event.assistantMessageEvent?.type === "text_delta" && typeof delta === "string") {
            statusBuffer = `${statusBuffer}${delta}`.slice(-1_000);
            const status = extractStatus(statusBuffer);
            if (status && status !== lastStatus) {
              lastStatus = status;
              options.onStatus?.(status);
            }
          }
        } catch {
          // Pi events are best-effort UI data; the exit code remains authoritative.
        }
      },
    });
    const ok = execution.code === 0 && !execution.signal;
    return { ok, finalText, ...(!ok ? { error: spawnFailure(execution) } : {}) };
  },
};
