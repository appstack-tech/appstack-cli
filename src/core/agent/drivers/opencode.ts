import type { AgentDriver, AgentOptions, AgentResult } from "../types";
import { extractStatus, onPath, spawnFailure, spawnLines } from "../spawn";

type Permission = "allow" | "deny";

export function opencodePermissions(options: AgentOptions): Record<string, Permission> {
  const write = options.capabilities.filesystem === "write";
  const network = options.capabilities.network;
  return {
    "*": "deny",
    read: "allow",
    glob: "allow",
    grep: "allow",
    list: "allow",
    lsp: "allow",
    edit: write ? "allow" : "deny",
    bash: write ? "allow" : "deny",
    webfetch: network ? "allow" : "deny",
    websearch: network ? "allow" : "deny",
    external_directory: "deny",
    task: "deny",
    question: "deny",
    skill: "deny",
  };
}

export function opencodeArgs(options: AgentOptions): string[] {
  return [
    "run",
    "--pure",
    "--format",
    "json",
    "--dir",
    options.cwd,
    "--auto",
    options.prompt,
  ];
}

export const opencodeDriver: AgentDriver = {
  id: "opencode",
  displayName: "OpenCode",
  detect: () => onPath("opencode"),
  async run(options): Promise<AgentResult> {
    let finalText: string | undefined;
    const sensitiveValues = [
      options.env?.APPSTACK_API_KEY ?? "",
      options.env?.APPSTACK_IOS_API_KEY ?? "",
      options.env?.APPSTACK_ANDROID_API_KEY ?? "",
    ];
    const execution = await spawnLines({
      bin: "opencode",
      args: opencodeArgs(options),
      cwd: options.cwd,
      env: {
        ...options.env,
        OPENCODE_PERMISSION: JSON.stringify(opencodePermissions(options)),
      },
      sensitiveValues,
      onStdout(line) {
        try {
          const event = JSON.parse(line) as {
            type?: string;
            part?: { text?: unknown };
          };
          if (event.type !== "text" || typeof event.part?.text !== "string") return;
          finalText = event.part.text.trim() || finalText;
          const status = extractStatus(event.part.text);
          if (status) options.onStatus?.(status);
        } catch {
          // OpenCode events are best-effort UI data; the exit code remains authoritative.
        }
      },
    });
    const ok = execution.code === 0 && !execution.signal;
    return { ok, finalText, ...(!ok ? { error: spawnFailure(execution) } : {}) };
  },
};
