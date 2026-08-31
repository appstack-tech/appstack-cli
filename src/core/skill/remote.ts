import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import type { SkillSnapshot } from "./cache";
import { REQUIRED_SKILL_FILES } from "./types";

const REPOSITORY = "appstack-tech/appstack-skills";
const ASSET_NAME = "appstack-skills.zip";
const SKILL_PREFIX = "skills/appstack-sdk/";
const SUPPORTED_RELEASE_MAJOR = 1;
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;

interface GitHubReleaseAsset {
  name?: string;
  browser_download_url?: string;
  digest?: string;
  size?: number;
}

interface GitHubRelease {
  tag_name?: string;
  assets?: GitHubReleaseAsset[];
}

export interface SkillRelease {
  version: string;
  assetUrl: string;
  digest: string;
  size: number;
}

function requestOptions(timeoutMs: number, accept: string): RequestInit {
  return {
    headers: {
      accept,
      "user-agent": "appstack-cli",
    },
    signal: AbortSignal.timeout(timeoutMs),
  };
}

function releaseVersion(tag: string | undefined): string {
  const match = tag?.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match || Number(match[1]) !== SUPPORTED_RELEASE_MAJOR) {
    throw new Error(
      `The latest skill release is not a supported ${SUPPORTED_RELEASE_MAJOR}.x version.`,
    );
  }
  return `${match[1]}.${match[2]}.${match[3]}`;
}

export async function fetchLatestSkillRelease(
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<SkillRelease> {
  const response = await fetcher(
    `https://api.github.com/repos/${REPOSITORY}/releases/latest`,
    requestOptions(2_000, "application/vnd.github+json"),
  );
  if (!response.ok) {
    throw new Error(`Skill release lookup failed with HTTP ${response.status}.`);
  }

  const release = (await response.json()) as GitHubRelease;
  const version = releaseVersion(release.tag_name);
  const asset = release.assets?.find((candidate) => candidate.name === ASSET_NAME);
  const expectedUrl = `https://github.com/${REPOSITORY}/releases/download/${release.tag_name}/${ASSET_NAME}`;
  if (
    !asset ||
    asset.browser_download_url !== expectedUrl ||
    typeof asset.size !== "number" ||
    asset.size <= 0 ||
    asset.size > MAX_ARCHIVE_BYTES ||
    !asset.digest?.match(/^sha256:[0-9a-f]{64}$/)
  ) {
    throw new Error(`The latest skill release has no valid ${ASSET_NAME} asset.`);
  }

  return {
    version,
    assetUrl: expectedUrl,
    digest: asset.digest,
    size: asset.size,
  };
}

export async function downloadSkillRelease(
  release: SkillRelease,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<SkillSnapshot> {
  const response = await fetcher(
    release.assetUrl,
    requestOptions(5_000, "application/zip"),
  );
  if (!response.ok) {
    throw new Error(`Skill release download failed with HTTP ${response.status}.`);
  }

  const archive = new Uint8Array(await response.arrayBuffer());
  if (
    archive.byteLength !== release.size ||
    archive.byteLength === 0 ||
    archive.byteLength > MAX_ARCHIVE_BYTES
  ) {
    throw new Error("The downloaded skill archive has an invalid size.");
  }
  const digest = `sha256:${createHash("sha256").update(archive).digest("hex")}`;
  if (digest !== release.digest) {
    throw new Error("The downloaded skill archive failed its SHA-256 check.");
  }

  const expected = new Set(
    REQUIRED_SKILL_FILES.map((path) => `${SKILL_PREFIX}${path}`),
  );
  let oversizedFile = false;
  const entries = unzipSync(archive, {
    filter: (entry) => {
      if (!expected.has(entry.name)) return false;
      if (entry.originalSize === 0 || entry.originalSize > MAX_FILE_BYTES) {
        oversizedFile = true;
        return false;
      }
      return true;
    },
  });
  if (oversizedFile) throw new Error("The skill release contains an invalid file size.");

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const files = new Map<string, string>();
  let totalBytes = 0;
  for (const path of REQUIRED_SKILL_FILES) {
    const body = entries[`${SKILL_PREFIX}${path}`];
    if (!body) throw new Error(`The skill release is missing ${path}.`);
    totalBytes += body.byteLength;
    files.set(path, decoder.decode(body));
  }
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error("The released skill is too large.");

  return { release: release.version, files };
}
