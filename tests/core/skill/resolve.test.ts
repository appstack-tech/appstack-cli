import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveSkill } from "@/core/skill/resolve";
import { REQUIRED_SKILL_FILES } from "@/core/skill/types";

const SHA = "a".repeat(40);
const NOW = Date.parse("2026-08-17T10:00:00Z");

function cacheRoot(): string {
  return mkdtempSync(join(tmpdir(), "appstack-skill-cache-"));
}

function remoteFiles(minimumCliVersion = "0.1.0"): Record<string, string> {
  const files: Record<string, string> = {
    "runtime.json": JSON.stringify({
      schemaVersion: 1,
      minimumCliVersion,
      files: [...REQUIRED_SKILL_FILES],
    }),
    "SKILL.md": "---\nname: appstack-sdk\ndescription: Remote fixture\n---\n\n# Remote Appstack SDK\n",
  };
  for (const path of REQUIRED_SKILL_FILES) {
    if (path === "SKILL.md") continue;
    const framework = path.split("/").at(-1)?.replace(".md", "");
    files[path] = `# Remote ${framework}\n`;
  }
  return files;
}

function githubFetch(
  files: Record<string, string>,
  calls: string[],
): typeof globalThis.fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("api.github.com")) {
      return new Response(JSON.stringify([{ sha: SHA }]), { status: 200 });
    }
    const marker = "/plugins/appstack/skills/appstack-sdk/";
    const path = url.slice(url.indexOf(marker) + marker.length);
    const body = files[path];
    return body === undefined
      ? new Response("missing", { status: 404 })
      : new Response(body, { status: 200 });
  }) as typeof globalThis.fetch;
}

test("downloads one commit-pinned snapshot and reuses the fresh cache", async () => {
  const root = cacheRoot();
  const calls: string[] = [];
  const first = await resolveSkill({
    framework: "swift",
    refresh: true,
    cacheRoot: root,
    fetch: githubFetch(remoteFiles(), calls),
    now: NOW,
    env: {},
  });

  assert.equal(first.source, "cache");
  assert.equal(first.sha, SHA);
  assert.match(first.body, /Remote Appstack SDK/);
  assert.match(first.body, /Remote swift/);
  assert.doesNotMatch(first.body, /Remote unity/);
  assert.equal(calls.every((url) => !url.includes("/main/")), true);

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
  assert.match(second.body, /Remote unity/);
  assert.equal(fetchedAgain, false);
});

test("bootstraps repositories that do not have a runtime manifest yet", async () => {
  const root = cacheRoot();
  const files = remoteFiles();
  delete files["runtime.json"];

  const result = await resolveSkill({
    framework: "swift",
    refresh: true,
    cacheRoot: root,
    fetch: githubFetch(files, []),
    now: NOW,
    env: {},
  });

  assert.equal(result.source, "cache");
  assert.equal(result.sha, SHA);
  assert.match(result.body, /Remote Appstack SDK/);
});

test("offline and incompatible updates fall back without failing", async () => {
  const offline = await resolveSkill({
    framework: "swift",
    refresh: true,
    cacheRoot: cacheRoot(),
    fetch: (async () => {
      throw new Error("offline");
    }) as typeof globalThis.fetch,
    now: NOW,
    env: {},
  });
  assert.equal(offline.source, "bundled");

  const incompatible = await resolveSkill({
    framework: "swift",
    refresh: true,
    cacheRoot: cacheRoot(),
    fetch: githubFetch(remoteFiles("99.0.0"), []),
    now: NOW,
    env: {},
  });
  assert.equal(incompatible.source, "bundled");
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
