import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, extname, join } from "node:path";
import { createInterface } from "node:readline";

const MAX_STDERR_CHARS = 8_000;

export interface SpawnResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr?: string;
}

export function redactDiagnostic(value: string, sensitiveValues: string[] = []): string {
  let diagnostic = value.slice(-MAX_STDERR_CHARS);
  for (const sensitive of sensitiveValues) {
    if (sensitive) diagnostic = diagnostic.split(sensitive).join("[REDACTED]");
  }
  return diagnostic
    .replace(/\bpk_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
    .replace(/\b(Bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))=\S+/gi, "$1=[REDACTED]");
}

export async function onPath(bin: string): Promise<boolean> {
  const windows = process.platform === "win32";
  const extensions =
    windows && !extname(bin)
      ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")
      : [""];
  const candidates = (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .flatMap((directory) => extensions.map((extension) => join(directory, `${bin}${extension}`)));
  try {
    await Promise.any(
      candidates.map((candidate) => access(candidate, windows ? constants.F_OK : constants.X_OK)),
    );
    return true;
  } catch {
    return false;
  }
}

export function spawnLines(options: {
  bin: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  onStdout: (line: string) => void;
  onStderr?: (line: string) => void;
  sensitiveValues?: string[];
}): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const child = spawn(options.bin, options.args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    createInterface({ input: child.stdout }).on("line", options.onStdout);
    createInterface({ input: child.stderr }).on("line", (line) => {
      options.onStderr?.(line);
      stderr = `${stderr}${line}\n`.slice(-MAX_STDERR_CHARS);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const diagnostic = redactDiagnostic(stderr.trim(), options.sensitiveValues);
      resolve({ code, signal, ...(diagnostic ? { stderr: diagnostic } : {}) });
    });
  });
}

export function spawnFailure(
  result: SpawnResult,
  detail?: string,
  sensitiveValues?: string[],
): string | undefined {
  if (detail) return redactDiagnostic(detail, sensitiveValues);
  if (result.stderr) return result.stderr;
  if (result.signal) return `Process terminated by ${result.signal}.`;
  if (result.code !== 0) return `Process exited with code ${result.code ?? "unknown"}.`;
  return undefined;
}

export function extractStatus(text: string): string | undefined {
  return text.match(/\[STATUS\]\s*(.+?)\s*$/m)?.[1]?.trim();
}
