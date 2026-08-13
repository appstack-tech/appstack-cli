import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { scanProjects } from "@/core/project/scan";

function fixture(): string {
  return mkdtempSync(join(tmpdir(), "appstack-scan-"));
}

test("detects a React Native app and suppresses its generated iOS project", async () => {
  const root = fixture();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { expo: "^54.0.0", "react-native": "0.81.0" } }),
  );
  mkdirSync(join(root, "ios", "Example.xcodeproj"), { recursive: true });

  const projects = await scanProjects(root);
  assert.deepEqual(
    projects.map((item) => item.framework),
    ["react-native"],
  );
  assert.equal(projects[0]?.relativePath, ".");
});

test("detects separate apps in a monorepo", async () => {
  const root = fixture();
  const flutter = join(root, "apps", "mobile");
  const unity = join(root, "apps", "game");
  mkdirSync(join(flutter), { recursive: true });
  mkdirSync(join(unity, "ProjectSettings"), { recursive: true });
  writeFileSync(
    join(flutter, "pubspec.yaml"),
    "name: mobile\ndependencies:\n  flutter:\n    sdk: flutter\n",
  );
  writeFileSync(
    join(unity, "ProjectSettings", "ProjectVersion.txt"),
    "m_EditorVersion: 6000.0.1f1\n",
  );

  const projects = await scanProjects(root);
  assert.deepEqual(
    projects.map((item) => item.framework).sort(),
    ["flutter", "unity"],
  );
});
