import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentDriver, AgentOptions, AgentResult } from "../types";
import { extractStatus, onPath, spawnFailure, spawnLines } from "../spawn";

export function codexArgs(options: AgentOptions, output: string): string[] {
  const readOnly = options.capabilities.filesystem === "read";
  const args = [
    "exec",
    options.prompt,
    "--json",
    "--sandbox",
    readOnly ? "read-only" : "workspace-write",
  ];
  if (options.capabilities.network) {
    args.push(
      "-c",
      `${readOnly ? "sandbox_read_only" : "sandbox_workspace_write"}.network_access=true`,
    );
  }
  args.push(
    "-C",
    options.cwd,
    "--skip-git-repo-check",
    "--output-last-message",
    output,
  );
  return args;
}

export const codexDriver: AgentDriver = {
  id: "codex",
  displayName: "Codex",
  detect: () => onPath("codex"),
  async run(options): Promise<AgentResult> {
    const output = join(
      tmpdir(),
      `appstack-codex-${process.pid}-${Date.now()}.txt`,
    );
    const sensitiveValues = [
      options.env?.APPSTACK_API_KEY ?? "",
      options.env?.APPSTACK_IOS_API_KEY ?? "",
      options.env?.APPSTACK_ANDROID_API_KEY ?? "",
    ];
    const execution = await spawnLines({
      bin: "codex",
      args: codexArgs(options, output),
      cwd: options.cwd,
      env: options.env,
      sensitiveValues,
      onStdout(line) {
        try {
          const value = JSON.parse(line) as Record<string, unknown>;
          const node = (value.item ?? value.msg ?? value) as Record<string, unknown>;
          const text = node.text ?? node.message ?? node.delta;
          const status = typeof text === "string" ? extractStatus(text) : undefined;
          if (status) options.onStatus?.(status);
        } catch {
          // Codex event schemas vary; final output is read from the requested file.
        }
      },
    });
    let finalText: string | undefined;
    try {
      finalText = (await readFile(output, "utf8")).trim() || undefined;
    } catch {
      // A failed run may not create a final-message file.
    } finally {
      await rm(output, { force: true }).catch(() => undefined);
    }
    const ok = execution.code === 0 && !execution.signal;
    return { ok, finalText, ...(!ok ? { error: spawnFailure(execution) } : {}) };
  },
};
