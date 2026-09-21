import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runWorkflow } from "@/commands/workflow";

test("an up-to-date upgrade exits before resolving the skill", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "appstack-workflow-current-"));
  const cache = mkdtempSync(join(tmpdir(), "appstack-workflow-cache-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      dependencies: {
        "react-native": "0.81.0",
        "react-native-appstack-sdk": "^2.6.0",
      },
    }),
  );
  writeFileSync(
    join(root, "package-lock.json"),
    JSON.stringify({
      lockfileVersion: 3,
      packages: { "node_modules/react-native-appstack-sdk": { version: "2.6.0" } },
    }),
  );
  writeFileSync(join(root, "app.tsx"), "AppstackSDK.configure(key);\n");

  const previousCache = process.env.APPSTACK_CACHE_DIR;
  const previousUpdates = process.env.APPSTACK_SKILL_UPDATES;
  process.env.APPSTACK_CACHE_DIR = cache;
  process.env.APPSTACK_SKILL_UPDATES = "off";
  t.mock.method(process.stdout, "write", () => true);
  try {
    await assert.doesNotReject(
      runWorkflow({ command: "upgrade", installDir: root, to: "2.6.0" }),
    );
  } finally {
    if (previousCache === undefined) delete process.env.APPSTACK_CACHE_DIR;
    else process.env.APPSTACK_CACHE_DIR = previousCache;
    if (previousUpdates === undefined) delete process.env.APPSTACK_SKILL_UPDATES;
    else process.env.APPSTACK_SKILL_UPDATES = previousUpdates;
  }
});
