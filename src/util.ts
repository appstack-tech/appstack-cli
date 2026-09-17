import { readFileSync } from "node:fs";

export function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

export function readJson<T>(path: string): T | undefined {
  const text = readText(path);
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

export function stableVersion(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
  return match?.[0];
}
