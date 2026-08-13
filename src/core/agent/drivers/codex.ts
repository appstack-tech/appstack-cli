import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentDriver, AgentOptions, AgentResult } from "../types";
import { extractStatus, onPath, spawnLines } from "../spawn";

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
    const code = await spawnLines({
      bin: "codex",
      args: codexArgs(options, output),
      cwd: options.cwd,
      env: options.env,
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
    return { ok: code === 0, finalText };
  },
};
