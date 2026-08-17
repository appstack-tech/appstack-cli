import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, extname, join } from "node:path";
import { createInterface } from "node:readline";

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
}): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.bin, options.args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
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
