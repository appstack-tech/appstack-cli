import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadSkillFromRoot } from "@/core/agent/skill";
import { parseSkillManifest } from "./manifest";
import type {
  ResolveSkillOptions,
  ResolvedSkill,
  SkillCacheState,
  SkillRuntimeManifest,
} from "./types";

const COMPLETE_FILE = ".complete";

export interface SkillSnapshot {
  sha: string;
  manifest: SkillRuntimeManifest;
  files: Map<string, string>;
}

export function defaultCacheRoot(
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
  home = homedir(),
): string {
  if (env.APPSTACK_CACHE_DIR) return resolve(env.APPSTACK_CACHE_DIR);
  if (platform === "win32" && env.LOCALAPPDATA) {
    return join(env.LOCALAPPDATA, "Appstack");
  }
  if (platform === "darwin") return join(home, "Library", "Caches", "appstack");
  return join(env.XDG_CACHE_HOME ?? join(home, ".cache"), "appstack");
}

export function skillCacheRoot(options: ResolveSkillOptions): string {
  return join(
    options.cacheRoot ?? defaultCacheRoot(options.env),
    "skills",
    "appstack-sdk",
  );
}

export async function readSkillState(root: string): Promise<SkillCacheState> {
  try {
    const value = JSON.parse(await readFile(join(root, "state.json"), "utf8")) as SkillCacheState;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export async function writeSkillState(
  root: string,
  state: SkillCacheState,
): Promise<void> {
  await mkdir(root, { recursive: true });
  const target = join(root, "state.json");
  const temporary = join(root, `.state-${process.pid}-${Date.now()}.json`);
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, target);
}

export async function loadCachedSkill(
  root: string,
  state: SkillCacheState,
  framework: ResolveSkillOptions["framework"],
): Promise<ResolvedSkill | undefined> {
  if (!state.activeSha || !/^[0-9a-f]{40}$/.test(state.activeSha)) return undefined;
  const directory = join(root, state.activeSha);
  try {
    await access(join(directory, COMPLETE_FILE));
    const manifest = JSON.parse(
      await readFile(join(directory, "runtime.json"), "utf8"),
    );
    parseSkillManifest(manifest);
    return {
      body: loadSkillFromRoot(directory, framework),
      source: "cache",
      sha: state.activeSha,
    };
  } catch {
    return undefined;
  }
}

async function isCompleteSnapshot(
  directory: string,
  manifest: SkillRuntimeManifest,
): Promise<boolean> {
  try {
    await access(join(directory, COMPLETE_FILE));
    parseSkillManifest(
      JSON.parse(await readFile(join(directory, "runtime.json"), "utf8")),
    );
    await Promise.all(manifest.files.map((path) => access(join(directory, path))));
    return true;
  } catch {
    return false;
  }
}

export async function installSkillSnapshot(
  root: string,
  snapshot: SkillSnapshot,
): Promise<void> {
  const destination = join(root, snapshot.sha);
  const temporary = join(
    root,
    `.incoming-${snapshot.sha}-${process.pid}-${Date.now()}`,
  );
  await mkdir(temporary, { recursive: true });
  try {
    for (const [path, body] of snapshot.files) {
      const target = join(temporary, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, body, { mode: 0o600 });
    }
    await writeFile(
      join(temporary, "runtime.json"),
      `${JSON.stringify(snapshot.manifest, null, 2)}\n`,
      { mode: 0o600 },
    );
    await writeFile(join(temporary, COMPLETE_FILE), `${snapshot.sha}\n`, {
      mode: 0o600,
    });

    await mkdir(root, { recursive: true });
    if (await isCompleteSnapshot(destination, snapshot.manifest)) {
      return;
    }
    await rm(destination, { recursive: true, force: true });
    try {
      await rename(temporary, destination);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error;
    }
  } finally {
    await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
  }
}
