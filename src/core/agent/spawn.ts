import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function onPath(bin: string): Promise<boolean> {
  const probe = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [bin] : ["-v", bin];
  try {
    await execFileAsync(probe, args, {
      shell: process.platform !== "win32",
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

export function spawnLines(options: {
  bin: string;
  args: string[];
  cwd: string;
  onStdout: (line: string) => void;
  onStderr?: (line: string) => void;
}): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.bin, options.args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    createInterface({ input: child.stdout }).on("line", options.onStdout);
    if (options.onStderr) {
      createInterface({ input: child.stderr }).on("line", options.onStderr);
    }
    child.on("error", reject);
    child.on("close", resolve);
  });
}

export function extractStatus(text: string): string | undefined {
  return text.match(/\[STATUS\]\s*(.+?)\s*$/m)?.[1]?.trim();
}
