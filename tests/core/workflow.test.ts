import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runWorkflow, type WorkflowArgs } from "@/commands/workflow";

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

test("JSON output is a deterministic inspection and does not mutate its arguments", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "appstack-workflow-json-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { "react-native": "0.81.0" } }),
  );

  let fetched = false;
  t.mock.method(globalThis, "fetch", async () => {
    fetched = true;
    throw new Error("JSON inspection must not use the network");
  });
  let output = "";
  t.mock.method(process.stdout, "write", (chunk: string | Uint8Array) => {
    if (typeof chunk === "string") output += chunk;
    return true;
  });
  const args: WorkflowArgs = { command: "upgrade", installDir: root, json: true };

  await runWorkflow(args);

  assert.equal(fetched, false);
  assert.equal(args.framework, undefined);
  const result = JSON.parse(output) as Record<string, unknown>;
  assert.equal("inspection" in result, true);
  assert.equal("latest" in result, false);
});

test("integration rejects the same supplied key for both platforms", async () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-workflow-same-keys-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { expo: "54.0.0" } }));

  await assert.rejects(
    runWorkflow({
      command: "integrate",
      installDir: root,
      dryRun: true,
      iosApiKey: "pk_legacy1234567890",
      androidApiKey: "pk_legacy1234567890",
    }),
    /iOS and Android require different Appstack API keys/,
  );
});
