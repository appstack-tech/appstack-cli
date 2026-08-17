import { parseSkillManifest } from "./manifest";
import type { SkillSnapshot } from "./cache";
import { REQUIRED_SKILL_FILES, SKILL_SCHEMA_VERSION } from "./types";

const REPOSITORY = "appstack-tech/appstack-skills";
const SKILL_PATH = "plugins/appstack/skills/appstack-sdk";
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;

function requestOptions(timeoutMs: number, accept: string): RequestInit {
  return {
    headers: {
      accept,
      "user-agent": "appstack-cli",
    },
    signal: AbortSignal.timeout(timeoutMs),
  };
}

export async function fetchLatestSkillSha(
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<string> {
  const query = new URLSearchParams({ path: SKILL_PATH, per_page: "1" });
  const response = await fetcher(
    `https://api.github.com/repos/${REPOSITORY}/commits?${query}`,
    requestOptions(2_000, "application/vnd.github+json"),
  );
  if (!response.ok) throw new Error(`Skill revision lookup failed with HTTP ${response.status}.`);
  const values = (await response.json()) as Array<{ sha?: string }>;
  const sha = values[0]?.sha;
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error("Skill revision lookup returned an invalid commit SHA.");
  }
  return sha;
}

async function fetchText(
  sha: string,
  path: string,
  fetcher: typeof globalThis.fetch,
  optional = false,
): Promise<string | undefined> {
  const response = await fetcher(
    `https://raw.githubusercontent.com/${REPOSITORY}/${sha}/${SKILL_PATH}/${path}`,
    requestOptions(3_000, "text/plain"),
  );
  if (optional && response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Skill download failed for ${path} with HTTP ${response.status}.`);
  const body = await response.text();
  if (!body || Buffer.byteLength(body, "utf8") > MAX_FILE_BYTES) {
    throw new Error(`Skill file ${path} is empty or too large.`);
  }
  return body;
}

export async function fetchSkillSnapshot(
  sha: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<SkillSnapshot> {
  const rawManifest = await fetchText(sha, "runtime.json", fetcher, true);
  let manifestValue: unknown = {
    schemaVersion: SKILL_SCHEMA_VERSION,
    minimumCliVersion: "0.1.0",
    files: [...REQUIRED_SKILL_FILES],
  };
  if (rawManifest) {
    try {
      manifestValue = JSON.parse(rawManifest);
    } catch {
      throw new Error("The remote skill runtime manifest is not valid JSON.");
    }
  }
  const manifest = parseSkillManifest(manifestValue);
  const bodies = await Promise.all(
    manifest.files.map(async (path) => {
      const body = await fetchText(sha, path, fetcher);
      if (!body) throw new Error(`Skill download returned no content for ${path}.`);
      return [path, body] as const;
    }),
  );
  const total = bodies.reduce(
    (sum, [, body]) => sum + Buffer.byteLength(body, "utf8"),
    0,
  );
  if (total > MAX_TOTAL_BYTES) throw new Error("The downloaded skill is too large.");
  return { sha, manifest, files: new Map(bodies) };
}
