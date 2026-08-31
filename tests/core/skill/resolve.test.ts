import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { resolveSkill } from "@/core/skill/resolve";
import { REQUIRED_SKILL_FILES } from "@/core/skill/types";

const RELEASE = "1.2.0";
const NOW = Date.parse("2026-09-01T10:00:00Z");
const ASSET_URL =
  `https://github.com/appstack-tech/appstack-skills/releases/download/${RELEASE}/appstack-skills.zip`;

function cacheRoot(): string {
  return mkdtempSync(join(tmpdir(), "appstack-skill-cache-"));
}

function skillArchive(missing?: string): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const path of REQUIRED_SKILL_FILES) {
    if (path === missing) continue;
    const content =
      path === "SKILL.md"
        ? "---\nname: appstack-sdk\ndescription: Remote fixture\n---\n\n# Released Appstack SDK\n"
        : `# Released ${path.split("/").at(-1)?.replace(".md", "")}\n`;
    files[`skills/appstack-sdk/${path}`] = strToU8(content);
  }
  files["skills/appstack-support/SKILL.md"] = strToU8("# Unrelated skill\n");
  return zipSync(files);
}

interface GitHubFetchOptions {
  release?: string;
  digest?: string;
  missing?: string;
}

function githubFetch(
  calls: string[],
  options: GitHubFetchOptions = {},
): typeof globalThis.fetch {
  const release = options.release ?? RELEASE;
  const archive = skillArchive(options.missing);
  const digest =
    options.digest ??
    `sha256:${createHash("sha256").update(archive).digest("hex")}`;
  const assetUrl =
    `https://github.com/appstack-tech/appstack-skills/releases/download/${release}/appstack-skills.zip`;

  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("api.github.com")) {
      return new Response(
        JSON.stringify({
          tag_name: release,
          assets: [
            {
              name: "appstack-skills.zip",
              browser_download_url: assetUrl,
              digest,
              size: archive.byteLength,
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url === assetUrl) return new Response(archive, { status: 200 });
    return new Response("missing", { status: 404 });
  }) as typeof globalThis.fetch;
}

test("downloads the latest skill release and reuses the fresh cache", async () => {
  const root = cacheRoot();
  const calls: string[] = [];
  const first = await resolveSkill({
    framework: "swift",
    refresh: true,
    cacheRoot: root,
    fetch: githubFetch(calls),
    now: NOW,
    env: {},
  });

  assert.equal(first.source, "cache");
  assert.equal(first.release, RELEASE);
  assert.match(first.body, /Released Appstack SDK/);
  assert.match(first.body, /Released swift/);
  assert.doesNotMatch(first.body, /Released unity/);
  assert.deepEqual(calls, [
    "https://api.github.com/repos/appstack-tech/appstack-skills/releases/latest",
    ASSET_URL,
  ]);

  let fetchedAgain = false;
  const second = await resolveSkill({
    framework: "unity",
    refresh: true,
    cacheRoot: root,
    fetch: (async () => {
      fetchedAgain = true;
      throw new Error("should not fetch");
    }) as typeof globalThis.fetch,
    now: NOW + 60_000,
    env: {},
  });
  assert.equal(second.source, "cache");
  assert.match(second.body, /Released unity/);
  assert.equal(fetchedAgain, false);
});

test("invalid, incompatible, and incomplete releases fall back safely", async () => {
  const invalidDigest = await resolveSkill({
    framework: "swift",
    refresh: true,
    cacheRoot: cacheRoot(),
    fetch: githubFetch([], { digest: `sha256:${"0".repeat(64)}` }),
    now: NOW,
    env: {},
  });
  assert.equal(invalidDigest.source, "bundled");

  const incompatible = await resolveSkill({
    framework: "swift",
    refresh: true,
    cacheRoot: cacheRoot(),
    fetch: githubFetch([], { release: "2.0.0" }),
    now: NOW,
    env: {},
  });
  assert.equal(incompatible.source, "bundled");

  const incomplete = await resolveSkill({
    framework: "swift",
    refresh: true,
    cacheRoot: cacheRoot(),
    fetch: githubFetch([], { missing: "references/swift.md" }),
    now: NOW,
    env: {},
  });
  assert.equal(incomplete.source, "bundled");
});

test("offline updates fall back without failing", async () => {
  const result = await resolveSkill({
    framework: "swift",
    refresh: true,
    cacheRoot: cacheRoot(),
    fetch: (async () => {
      throw new Error("offline");
    }) as typeof globalThis.fetch,
    now: NOW,
    env: {},
  });
  assert.equal(result.source, "bundled");
});

test("dry resolution does not create skill cache files", async () => {
  const root = cacheRoot();
  const result = await resolveSkill({
    framework: "flutter",
    refresh: false,
    cacheRoot: root,
    env: {},
  });
  assert.equal(result.source, "bundled");
  assert.equal(existsSync(join(root, "skills")), false);
});

test("development override bypasses cache and network", async () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-skill-override-"));
  mkdirSync(join(root, "references"), { recursive: true });
  writeFileSync(join(root, "SKILL.md"), "# Override Appstack SDK\n");
  writeFileSync(join(root, "references", "kotlin.md"), "# Override Kotlin\n");

  const result = await resolveSkill({
    framework: "kotlin",
    refresh: true,
    cacheRoot: cacheRoot(),
    env: { APPSTACK_SKILL_DIR: root },
  });
  assert.equal(result.source, "override");
  assert.match(result.body, /Override Kotlin/);
});
