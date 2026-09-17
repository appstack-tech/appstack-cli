import { loadSkillFromRoot } from "@/core/agent/skill";
import {
  installSkillSnapshot,
  loadCachedSkill,
  readSkillState,
  skillCacheRoot,
  writeSkillState,
} from "./cache";
import {
  downloadSkillRelease,
  fetchLatestSkillRelease,
  SKILL_REPOSITORY,
} from "./remote";
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

function unavailable(reason: string, cause?: unknown): Error {
  const detail =
    cause instanceof Error && cause.message ? ` (${cause.message})` : "";
  return new Error(
    `The Appstack skill is not available yet. ${reason}${detail} ` +
      `The CLI downloads skills from ${SKILL_REPOSITORY} on GitHub, so the ` +
      "first run needs network access. Connect and try again, or set " +
      "APPSTACK_SKILL_DIR to a local copy.",
  );
}

function cachedOrThrow(
  cached: ResolvedSkill | undefined,
  reason: string,
): ResolvedSkill {
  if (cached) return cached;
  throw unavailable(reason);
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

  const root = skillCacheRoot(options);
  const state = await readSkillState(root);
  const cached = await loadCachedSkill(root, state, options.framework);
  if (!options.refresh) {
    return cachedOrThrow(
      cached,
      "Nothing is cached and this run does not update skills.",
    );
  }
  if (updatesDisabled(env)) {
    return cachedOrThrow(
      cached,
      "Skill updates are off and nothing is cached.",
    );
  }

  const now = options.now ?? Date.now();
  if (
    (cached && recent(state.checkedAt, now, SUCCESS_INTERVAL_MS)) ||
    recent(state.failedAt, now, FAILURE_INTERVAL_MS)
  ) {
    return cachedOrThrow(
      cached,
      "The last update failed and it retries in about an hour.",
    );
  }

  const fetcher = options.fetch ?? globalThis.fetch;
  try {
    const release = await fetchLatestSkillRelease(fetcher);
    if (cached && state.activeRelease === release.version) {
      await writeSkillState(root, {
        activeRelease: release.version,
        checkedAt: new Date(now).toISOString(),
      });
      return cached;
    }

    const snapshot = await downloadSkillRelease(release, fetcher);
    await installSkillSnapshot(root, snapshot);
    const nextState: SkillCacheState = {
      activeRelease: release.version,
      checkedAt: new Date(now).toISOString(),
    };
    await writeSkillState(root, nextState);
    const installed = await loadCachedSkill(root, nextState, options.framework);
    if (!installed) throw new Error("The downloaded skill could not be loaded.");
    return installed;
  } catch (error) {
    await recordFailure(root, state, now);
    if (cached) return cached;
    throw unavailable("The latest release could not be downloaded.", error);
  }
}
