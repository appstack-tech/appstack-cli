import type { AgentDriver, AgentOptions, AgentResult } from "../types";
import { extractStatus, onPath, spawnLines } from "../spawn";

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
    let ok = false;
    const code = await spawnLines({
      bin: "claude",
      args: claudeArgs(options),
      cwd: options.cwd,
      env: options.env,
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
            ok = message.subtype === "success" && message.is_error !== true;
          }
        } catch {
          // Claude's stream is best-effort UI data; the exit code remains authoritative.
        }
      },
    });
    return { ok: ok || code === 0, finalText };
  },
};
