import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { resolveSkill } from "@/core/skill/resolve";
import { removeSkillCache } from "@/core/skill/cache";
import { REQUIRED_SKILL_FILES } from "@/core/skill/types";

const RELEASE = "1.2.0";
const NOW = Date.parse("2026-09-01T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ASSET_URL =
  `https://github.com/appstack-tech/appstack-skills/releases/download/${RELEASE}/appstack-skills.zip`;

function cacheRoot(): string {
  return mkdtempSync(join(tmpdir(), "appstack-skill-cache-"));
}

function offlineFetch(): typeof globalThis.fetch {
  return (async () => {
    throw new Error("offline");
  }) as typeof globalThis.fetch;
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

test("invalid, incompatible, and incomplete releases fail explicitly", async () => {
  await assert.rejects(
    resolveSkill({
      framework: "swift",
      refresh: true,
      cacheRoot: cacheRoot(),
      fetch: githubFetch([], { digest: `sha256:${"0".repeat(64)}` }),
      now: NOW,
      env: {},
    }),
    /skill is not available yet.*failed its SHA-256 check/,
  );

  await assert.rejects(
    resolveSkill({
      framework: "swift",
      refresh: true,
      cacheRoot: cacheRoot(),
      fetch: githubFetch([], { release: "2.0.0" }),
      now: NOW,
      env: {},
    }),
    /skill is not available yet.*not a supported 1\.x version/,
  );

  await assert.rejects(
    resolveSkill({
      framework: "swift",
      refresh: true,
      cacheRoot: cacheRoot(),
      fetch: githubFetch([], { missing: "references/swift.md" }),
      now: NOW,
      env: {},
    }),
    /skill is not available yet.*missing references\/swift\.md/,
  );
});

test("a cold cache with no network fails with an actionable error", async () => {
  await assert.rejects(
    resolveSkill({
      framework: "swift",
      refresh: true,
      cacheRoot: cacheRoot(),
      fetch: offlineFetch(),
      now: NOW,
      env: {},
    }),
    /skill is not available yet.*offline.*APPSTACK_SKILL_DIR/,
  );
});

test("a failed refresh keeps the last valid cached release", async () => {
  const root = cacheRoot();
  const first = await resolveSkill({
    framework: "swift",
    refresh: true,
    cacheRoot: root,
    fetch: githubFetch([]),
    now: NOW,
    env: {},
  });
  assert.equal(first.source, "cache");

  const second = await resolveSkill({
    framework: "swift",
    refresh: true,
    cacheRoot: root,
    fetch: offlineFetch(),
    now: NOW + 2 * DAY,
    env: {},
  });
  assert.equal(second.source, "cache");
  assert.equal(second.release, RELEASE);
  assert.match(second.body, /Released Appstack SDK/);
});

test("refresh-free resolution neither fetches nor writes cache files", async () => {
  const root = cacheRoot();
  await assert.rejects(
    resolveSkill({
      framework: "flutter",
      refresh: false,
      cacheRoot: root,
      fetch: offlineFetch(),
      env: {},
    }),
    /skill is not available yet.*does not update skills/,
  );
  assert.equal(existsSync(join(root, "skills")), false);
});

test("disabled updates use the cache without touching the network", async () => {
  const root = cacheRoot();
  await resolveSkill({
    framework: "swift",
    refresh: true,
    cacheRoot: root,
    fetch: githubFetch([]),
    now: NOW,
    env: {},
  });

  let fetched = false;
  const cached = await resolveSkill({
    framework: "swift",
    refresh: true,
    cacheRoot: root,
    fetch: (async () => {
      fetched = true;
      throw new Error("should not fetch");
    }) as typeof globalThis.fetch,
    now: NOW + 2 * DAY,
    env: { APPSTACK_SKILL_UPDATES: "off" },
  });
  assert.equal(cached.source, "cache");
  assert.equal(fetched, false);

  await assert.rejects(
    resolveSkill({
      framework: "swift",
      refresh: true,
      cacheRoot: cacheRoot(),
      fetch: offlineFetch(),
      now: NOW,
      env: { APPSTACK_SKILL_UPDATES: "off" },
    }),
    /skill is not available yet.*Skill updates are off/,
  );
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

test("removes only the downloaded Appstack skill cache", async () => {
  const root = cacheRoot();
  await resolveSkill({
    framework: "swift",
    refresh: true,
    cacheRoot: root,
    fetch: githubFetch([]),
    now: NOW,
    env: {},
  });
  const unrelated = join(root, "unrelated.txt");
  writeFileSync(unrelated, "keep me");

  const removed = await removeSkillCache({ cacheRoot: root, env: {} });
  assert.deepEqual(removed, {
    path: join(root, "skills", "appstack-sdk"),
    removed: true,
  });
  assert.equal(existsSync(removed.path), false);
  assert.equal(existsSync(unrelated), true);

  assert.deepEqual(await removeSkillCache({ cacheRoot: root, env: {} }), {
    path: removed.path,
    removed: false,
  });
});

test("cache uninstall ignores APPSTACK_SKILL_DIR overrides", async () => {
  const root = cacheRoot();
  const override = mkdtempSync(join(tmpdir(), "appstack-skill-override-"));
  writeFileSync(join(override, "SKILL.md"), "# User-managed skill\n");

  const result = await removeSkillCache({
    cacheRoot: root,
    env: { APPSTACK_SKILL_DIR: override },
  });

  assert.equal(result.removed, false);
  assert.equal(existsSync(join(override, "SKILL.md")), true);
});
