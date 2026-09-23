import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runWorkflow, stripStatusLines, taskReferences, type WorkflowArgs } from "@/commands/workflow";
import type { Inspection } from "@/core/sdk/inspect";

// The node:test child process reports results to its parent through binary
// stdout writes; pass those through and capture only the CLI's text output.
function captureStdout(t: { mock: { method: typeof import("node:test").mock.method } }): () => string {
  let output = "";
  const write = process.stdout.write.bind(process.stdout) as (chunk: string | Uint8Array) => boolean;
  t.mock.method(process.stdout, "write", (chunk: string | Uint8Array) => {
    if (typeof chunk !== "string") return write(chunk);
    output += chunk;
    return true;
  });
  return () => output;
}

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
  captureStdout(t);
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
  const output = captureStdout(t);
  const args: WorkflowArgs = { command: "upgrade", installDir: root, json: true };

  await runWorkflow(args);

  assert.equal(fetched, false);
  assert.equal(args.framework, undefined);
  const result = JSON.parse(output()) as Record<string, unknown>;
  assert.equal("inspection" in result, true);
  assert.equal("latest" in result, false);
});

test("integration warns about the same supplied key without blocking", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "appstack-workflow-same-keys-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { expo: "54.0.0" } }));
  const output = captureStdout(t);

  await assert.doesNotReject(
    runWorkflow({
      command: "integrate",
      installDir: root,
      dryRun: true,
      iosApiKey: "pk_legacy1234567890",
      androidApiKey: "pk_legacy1234567890",
    }),
  );
  assert.match(output(), /supplied iOS and Android API keys are identical/);
  assert.doesNotMatch(output(), /pk_legacy1234567890/);
});


test("loads task references by workflow and detected partners", () => {
  const base = { partners: [] } as unknown as Inspection;
  const withPartner = { partners: ["revenuecat"] } as unknown as Inspection;
  assert.deepEqual(taskReferences("review", base), ["review-troubleshooting", "event-design"]);
  assert.deepEqual(taskReferences("review", withPartner), [
    "review-troubleshooting",
    "event-design",
    "partner-integrations",
  ]);
  assert.deepEqual(taskReferences("integrate", base), []);
  assert.deepEqual(taskReferences("integrate", withPartner), ["partner-integrations"]);
  assert.deepEqual(taskReferences("upgrade", withPartner), []);
});

test("removes agent status lines from the final report", () => {
  assert.equal(stripStatusLines("[STATUS] Done\n\n## Report\nBody\n[STATUS] Done"), "## Report\nBody");
});

test("upgrade explains an unreadable version instead of suggesting integration", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "appstack-workflow-unreadable-"));
  mkdirSync(join(root, "app"));
  writeFileSync(join(root, "settings.gradle.kts"), 'include(":app")\n');
  writeFileSync(
    join(root, "app", "build.gradle.kts"),
    'implementation("tech.appstack.android-sdk:appstack-android-sdk:$appstackVersion")\n',
  );
  captureStdout(t);
  await assert.rejects(
    runWorkflow({ command: "upgrade", installDir: root, to: "1.11.0", dryRun: true }),
    /installed, but its version could not be read.*--to <version>/,
  );
});

test("integrate dry run presents the missing SDK as the starting state with a plan", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "appstack-workflow-integrate-plan-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { "react-native": "0.81.0" } }));
  const output = captureStdout(t);
  await runWorkflow({ command: "integrate", installDir: root, dryRun: true, iosApiKey: "pk_ios_plan1234567890" });
  assert.match(output(), /Appstack is not integrated yet/);
  assert.doesNotMatch(output(), /✗/);
  assert.match(output(), /Plan: An agent would install/);
  assert.match(output(), /Keys supplied: APPSTACK_IOS_API_KEY/);
  assert.doesNotMatch(output(), /pk_ios_plan1234567890/);
});
