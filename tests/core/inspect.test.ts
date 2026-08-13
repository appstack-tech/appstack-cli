import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { DetectedProject } from "@/core/project/scan";
import { inspectProject } from "@/core/sdk/inspect";

function reactNativeProject(root: string): DetectedProject {
  return {
    framework: "react-native",
    frameworkLabel: "React Native",
    path: root,
    relativePath: ".",
    name: "fixture",
  };
}

test("finds deterministic integration problems without exposing key values", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { "react-native-appstack-sdk": "2.4.0" } }),
  );
  writeFileSync(
    join(root, "app.tsx"),
    [
      "AppstackSDK.configure('pk_example1234567890', false, endpointBaseUrl);",
      "AppstackSDK.configure(key, { isDebug: true });",
      "AppstackSDK.sendEvent('INSTALL');",
      "AppstackSDK.sendEvent('CUSTOM', 'wallet_connected', {});",
    ].join("\n"),
  );

  const result = inspectProject(reactNativeProject(root));
  assert.equal(result.installedVersion, "2.4.0");
  assert.equal(result.configureCount, 2);
  assert.deepEqual(result.customEventNames, ["wallet_connected"]);
  assert.deepEqual(
    result.findings.map((item) => item.code).sort(),
    [
      "configure-duplicate",
      "deprecated-config-options",
      "hardcoded-api-key",
      "manual-install-event",
    ],
  );
  assert.equal(JSON.stringify(result).includes("pk_example1234567890"), false);
});

test("reports a missing dependency and initialization", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-empty-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: {} }));
  const result = inspectProject(reactNativeProject(root));
  assert.deepEqual(
    result.findings.map((item) => item.code),
    ["sdk-not-installed", "configure-missing"],
  );
});

test("ignores commented-out configure calls", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-swift-"));
  writeFileSync(
    join(root, "Package.resolved"),
    JSON.stringify({
      pins: [
        {
          identity: "ios-appstack-sdk",
          state: { version: "4.5.0" },
        },
      ],
    }),
  );
  writeFileSync(
    join(root, "AppDelegate.swift"),
    [
      "/* AppstackAttributionSdk.shared.configure(apiKey: oldKey) */",
      "AppstackAttributionSdk.shared.configure(apiKey: key)",
    ].join("\n"),
  );
  const result = inspectProject({
    framework: "swift",
    frameworkLabel: "Swift (iOS)",
    path: root,
    relativePath: ".",
    name: "fixture",
  });
  assert.equal(result.configureCount, 1);
  assert.equal(result.findings.some((item) => item.code === "configure-duplicate"), false);
});

test("resolves a local Unity package version", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-unity-"));
  const sdk = mkdtempSync(join(tmpdir(), "appstack-unity-sdk-"));
  mkdirSync(join(root, "Packages"), { recursive: true });
  writeFileSync(join(sdk, "package.json"), JSON.stringify({ version: "1.2.0" }));
  writeFileSync(
    join(root, "Packages", "manifest.json"),
    JSON.stringify({ dependencies: { "com.appstack.unity-sdk": `file:${sdk}` } }),
  );
  const result = inspectProject({
    framework: "unity",
    frameworkLabel: "Unity",
    path: root,
    relativePath: ".",
    name: "fixture",
  });
  assert.equal(result.installed, true);
  assert.equal(result.installedVersion, "1.2.0");
});
