import type { AgentDriver, AgentOptions, AgentResult } from "../types";
import { extractStatus, onPath, spawnFailure, spawnLines } from "../spawn";

export function claudeSucceeded(
  resultOk: boolean | undefined,
  execution: { code: number | null; signal: NodeJS.Signals | null },
): boolean {
  return (resultOk ?? execution.code === 0) && execution.code === 0 && !execution.signal;
}

function tools(options: AgentOptions): string[] {
  const result = ["Read", "Glob", "Grep", "Bash", "WebFetch", "WebSearch"];
  if (options.capabilities.filesystem === "write") result.push("Write", "Edit");
  return result;
}

export function claudeArgs(options: AgentOptions): string[] {
  return [
    "-p",
    options.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    options.capabilities.filesystem === "read" ? "plan" : "acceptEdits",
    "--add-dir",
    options.cwd,
    "--allowedTools",
    tools(options).join(","),
  ];
}

export const claudeDriver: AgentDriver = {
  id: "claude",
  displayName: "Claude Code",
  detect: () => onPath("claude"),
  async run(options): Promise<AgentResult> {
    let finalText: string | undefined;
    let resultOk: boolean | undefined;
    let resultError: string | undefined;
    const sensitiveValues = [
      options.env?.APPSTACK_API_KEY ?? "",
      options.env?.APPSTACK_IOS_API_KEY ?? "",
      options.env?.APPSTACK_ANDROID_API_KEY ?? "",
    ];
    const execution = await spawnLines({
      bin: "claude",
      args: claudeArgs(options),
      cwd: options.cwd,
      env: options.env,
      sensitiveValues,
      onStdout(line) {
        try {
          const message = JSON.parse(line) as Record<string, unknown>;
          if (message.type === "assistant") {
            const blocks = (message.message as { content?: unknown[] } | undefined)?.content;
            for (const block of blocks ?? []) {
              const text = (block as { type?: string; text?: string }).text;
              const status = text ? extractStatus(text) : undefined;
              if (status) options.onStatus?.(status);
            }
          }
          if (message.type === "result") {
            if (typeof message.result === "string") finalText = message.result;
            resultOk = message.subtype === "success" && message.is_error !== true;
            if (!resultOk) {
              resultError = typeof message.result === "string"
                ? message.result
                : `Claude returned ${String(message.subtype ?? "an error")}.`;
            }
          }
        } catch {
          // Malformed progress events are ignored; a valid result event remains authoritative.
        }
      },
    });
    const ok = claudeSucceeded(resultOk, execution);
    return {
      ok,
      finalText,
      ...(!ok ? { error: spawnFailure(execution, resultError, sensitiveValues) } : {}),
    };
  },
};
