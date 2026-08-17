import { join } from "node:path";
import { loadSkillFromRoot } from "@/core/agent/skill";
import { packageRoot } from "@/util";
import {
  installSkillSnapshot,
  loadCachedSkill,
  readSkillState,
  skillCacheRoot,
  writeSkillState,
} from "./cache";
import { fetchLatestSkillSha, fetchSkillSnapshot } from "./remote";
import type { ResolveSkillOptions, ResolvedSkill, SkillCacheState } from "./types";

const SUCCESS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FAILURE_INTERVAL_MS = 60 * 60 * 1000;

function recent(value: string | undefined, now: number, interval: number): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && now - timestamp < interval;
}

function updatesDisabled(env: NodeJS.ProcessEnv): boolean {
  return ["0", "false", "off"].includes(
    (env.APPSTACK_SKILL_UPDATES ?? "").toLowerCase(),
  );
}

function bundledSkill(options: ResolveSkillOptions): ResolvedSkill {
  const root =
    options.bundledRoot ?? join(packageRoot(), "skills", "appstack-sdk");
  return {
    body: loadSkillFromRoot(root, options.framework),
    source: "bundled",
  };
}

async function recordFailure(
  root: string,
  state: SkillCacheState,
  now: number,
): Promise<void> {
  await writeSkillState(root, {
    ...state,
    failedAt: new Date(now).toISOString(),
  }).catch(() => undefined);
}

export async function resolveSkill(
  options: ResolveSkillOptions,
): Promise<ResolvedSkill> {
  const env = options.env ?? process.env;
  if (env.APPSTACK_SKILL_DIR) {
    return {
      body: loadSkillFromRoot(env.APPSTACK_SKILL_DIR, options.framework),
      source: "override",
    };
  }

  const fallback = bundledSkill(options);
  const root = skillCacheRoot(options);
  const state = await readSkillState(root);
  const cached = await loadCachedSkill(root, state, options.framework);
  if (!options.refresh || updatesDisabled(env)) return cached ?? fallback;

  const now = options.now ?? Date.now();
  if (
    (cached && recent(state.checkedAt, now, SUCCESS_INTERVAL_MS)) ||
    recent(state.failedAt, now, FAILURE_INTERVAL_MS)
  ) {
    return cached ?? fallback;
  }

  const fetcher = options.fetch ?? globalThis.fetch;
  try {
    const sha = await fetchLatestSkillSha(fetcher);
    if (cached && state.activeSha === sha) {
      await writeSkillState(root, {
        activeSha: sha,
        checkedAt: new Date(now).toISOString(),
      });
      return cached;
    }

    const snapshot = await fetchSkillSnapshot(sha, fetcher);
    await installSkillSnapshot(root, snapshot);
    const nextState: SkillCacheState = {
      activeSha: sha,
      checkedAt: new Date(now).toISOString(),
    };
    await writeSkillState(root, nextState);
    return (await loadCachedSkill(root, nextState, options.framework)) ?? fallback;
  } catch {
    await recordFailure(root, state, now);
    return cached ?? fallback;
  }
}
