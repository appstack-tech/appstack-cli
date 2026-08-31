import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadSkillFromRoot } from "@/core/agent/skill";
import {
  REQUIRED_SKILL_FILES,
  type ResolveSkillOptions,
  type ResolvedSkill,
  type SkillCacheState,
} from "./types";

const COMPLETE_FILE = ".complete";

export interface SkillSnapshot {
  release: string;
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

function validRelease(value: string | undefined): value is string {
  return Boolean(value?.match(/^1\.\d+\.\d+$/));
}

export async function loadCachedSkill(
  root: string,
  state: SkillCacheState,
  framework: ResolveSkillOptions["framework"],
): Promise<ResolvedSkill | undefined> {
  if (!validRelease(state.activeRelease)) return undefined;
  const directory = join(root, state.activeRelease);
  try {
    await access(join(directory, COMPLETE_FILE));
    await Promise.all(REQUIRED_SKILL_FILES.map((path) => access(join(directory, path))));
    return {
      body: loadSkillFromRoot(directory, framework),
      source: "cache",
      release: state.activeRelease,
    };
  } catch {
    return undefined;
  }
}

async function isCompleteSnapshot(directory: string): Promise<boolean> {
  try {
    await access(join(directory, COMPLETE_FILE));
    await Promise.all(REQUIRED_SKILL_FILES.map((path) => access(join(directory, path))));
    return true;
  } catch {
    return false;
  }
}

export async function installSkillSnapshot(
  root: string,
  snapshot: SkillSnapshot,
): Promise<void> {
  if (!validRelease(snapshot.release)) throw new Error("Invalid skill release version.");
  const destination = join(root, snapshot.release);
  const temporary = join(
    root,
    `.incoming-${snapshot.release}-${process.pid}-${Date.now()}`,
  );
  await mkdir(temporary, { recursive: true });
  try {
    for (const path of REQUIRED_SKILL_FILES) {
      const body = snapshot.files.get(path);
      if (!body) throw new Error(`The skill snapshot is missing ${path}.`);
      const target = join(temporary, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, body, { mode: 0o600 });
    }
    await writeFile(join(temporary, COMPLETE_FILE), `${snapshot.release}\n`, {
      mode: 0o600,
    });

    await mkdir(root, { recursive: true });
    if (await isCompleteSnapshot(destination)) return;
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
