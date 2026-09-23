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
  assert.equal(result.installedVersion, undefined);
  assert.equal(result.installedVersionSource, undefined);
});

test("finds platform key mismatches in native targets without exposing key values", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-platform-keys-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { "react-native-appstack-sdk": "2.4.0" } }),
  );
  mkdirSync(join(root, "ios"));
  mkdirSync(join(root, "android"));
  writeFileSync(join(root, "ios", "Keys.xcconfig"), "APPSTACK_KEY=pk_android_wrong1234567890\n");
  writeFileSync(join(root, "android", "gradle.properties"), "appstackKey=pk_ios_wrong1234567890\n");
  writeFileSync(join(root, "app.tsx"), "const keys = ['pk_ios_shared1234567890', 'pk_android_shared1234567890'];\n");

  const result = inspectProject(reactNativeProject(root));
  const mismatch = result.findings.find((item) => item.code === "api-key-platform-mismatch");
  assert.equal(mismatch?.severity, "warning");
  assert.deepEqual(mismatch?.files, ["android/gradle.properties", "ios/Keys.xcconfig"]);
  assert.equal(JSON.stringify(result).includes("wrong1234567890"), false);
});

test("accepts matching platform keys in native targets", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-matching-keys-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: {} }));
  mkdirSync(join(root, "ios"));
  mkdirSync(join(root, "android"));
  writeFileSync(join(root, "ios", "Keys.xcconfig"), "APPSTACK_KEY=pk_ios_correct1234567890\n");
  writeFileSync(join(root, "android", "gradle.properties"), "appstackKey=pk_android_correct1234567890\n");

  const result = inspectProject(reactNativeProject(root));
  assert.equal(result.findings.some((item) => item.code === "api-key-platform-mismatch"), false);
});

test("finds a legacy key reused in native iOS and Android config", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-native-reuse-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: {} }));
  mkdirSync(join(root, "ios"));
  mkdirSync(join(root, "android"));
  writeFileSync(join(root, "ios", "Keys.xcconfig"), "APPSTACK_KEY=pk_samelegacy1234567890\n");
  writeFileSync(join(root, "android", "gradle.properties"), "appstackKey=pk_samelegacy1234567890\n");

  const result = inspectProject(reactNativeProject(root));
  const reused = result.findings.find((item) => item.code === "api-key-reused-across-platforms");
  assert.equal(reused?.severity, "warning");
  assert.deepEqual(reused?.files, ["android/gradle.properties", "ios/Keys.xcconfig"]);
});

test("checks Expo CNG platform config without native directories", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-expo-cng-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { expo: "54.0.0" } }),
  );
  writeFileSync(
    join(root, "app.json"),
    JSON.stringify({ expo: {
      ios: { extra: { appstackKey: "pk_android_wrong1234567890" } },
      android: { extra: { appstackKey: "pk_android_correct1234567890" } },
    } }),
  );

  const result = inspectProject(reactNativeProject(root));
  const mismatch = result.findings.find((item) => item.code === "api-key-platform-mismatch");
  assert.deepEqual(mismatch?.files, ["app.json"]);
  assert.equal(JSON.stringify(result).includes("wrong1234567890"), false);
});

test("detects one legacy key reused in both Expo CNG platforms", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-legacy-key-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { expo: "54.0.0" } }));
  writeFileSync(
    join(root, "app.json"),
    JSON.stringify({ expo: {
      ios: { extra: { appstackKey: "pk_legacy1234567890" } },
      android: { extra: { appstackKey: "pk_legacy1234567890" } },
    } }),
  );

  const result = inspectProject(reactNativeProject(root));
  assert.equal(result.findings.some((item) => item.code === "api-key-platform-mismatch"), false);
  assert.deepEqual(
    result.findings.find((item) => item.code === "api-key-reused-across-platforms")?.files,
    ["app.json"],
  );
  assert.equal(JSON.stringify(result).includes("legacy1234567890"), false);
});

test("accepts distinct legacy keys for iOS and Android", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-distinct-legacy-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { expo: "54.0.0" } }));
  writeFileSync(
    join(root, "app.json"),
    JSON.stringify({ expo: {
      ios: { extra: { appstackKey: "pk_legacy_ios1234567890" } },
      android: { extra: { appstackKey: "pk_legacy_android1234567890" } },
    } }),
  );

  const result = inspectProject(reactNativeProject(root));
  assert.equal(result.findings.some((item) => item.code === "api-key-platform-mismatch"), false);
  assert.equal(result.findings.some((item) => item.code === "api-key-reused-across-platforms"), false);
});

test("omits the version source when a platform version is not detected", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-empty-swift-"));

  const result = inspectProject({
    framework: "swift",
    frameworkLabel: "Swift (iOS)",
    path: root,
    relativePath: ".",
    name: "fixture",
  });

  assert.equal(result.installedVersion, undefined);
  assert.equal(result.installedVersionSource, undefined);
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

test("uses the exact npm lockfile version for React Native", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-npm-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { "react-native-appstack-sdk": "^2.4.0" } }),
  );
  writeFileSync(
    join(root, "package-lock.json"),
    JSON.stringify({
      lockfileVersion: 3,
      packages: { "node_modules/react-native-appstack-sdk": { version: "2.6.1" } },
    }),
  );
  const result = inspectProject(reactNativeProject(root));
  assert.equal(result.installedVersion, "2.6.1");
  assert.equal(result.installedVersionSource, "lockfile");
});

test("uses Yarn and pnpm lockfile versions for React Native", () => {
  const yarnRoot = mkdtempSync(join(tmpdir(), "appstack-inspect-yarn-"));
  writeFileSync(
    join(yarnRoot, "package.json"),
    JSON.stringify({
      packageManager: "yarn@1.22.0",
      dependencies: { "react-native-appstack-sdk": "^2.4.0" },
    }),
  );
  writeFileSync(
    join(yarnRoot, "yarn.lock"),
    'react-native-appstack-sdk@^2.4.0:\n  version "2.6.2"\n',
  );
  const yarn = inspectProject(reactNativeProject(yarnRoot));
  assert.equal(yarn.installedVersion, "2.6.2");
  assert.equal(yarn.installedVersionSource, "lockfile");

  const pnpmRoot = mkdtempSync(join(tmpdir(), "appstack-inspect-pnpm-"));
  writeFileSync(
    join(pnpmRoot, "package.json"),
    JSON.stringify({
      packageManager: "pnpm@9.0.0",
      dependencies: { "react-native-appstack-sdk": "^2.4.0" },
    }),
  );
  writeFileSync(
    join(pnpmRoot, "pnpm-lock.yaml"),
    "packages:\n  react-native-appstack-sdk@2.6.3:\n    resolution: {}\n",
  );
  const pnpm = inspectProject(reactNativeProject(pnpmRoot));
  assert.equal(pnpm.installedVersion, "2.6.3");
  assert.equal(pnpm.installedVersionSource, "lockfile");
});

test("finds a workspace lockfile above a React Native app", () => {
  const workspace = mkdtempSync(join(tmpdir(), "appstack-inspect-workspace-"));
  const app = join(workspace, "apps", "mobile");
  mkdirSync(app, { recursive: true });
  writeFileSync(
    join(app, "package.json"),
    JSON.stringify({ dependencies: { "react-native-appstack-sdk": "^2.4.0" } }),
  );
  writeFileSync(
    join(workspace, "package-lock.json"),
    JSON.stringify({
      lockfileVersion: 3,
      packages: { "node_modules/react-native-appstack-sdk": { version: "2.6.4" } },
    }),
  );
  const result = inspectProject(reactNativeProject(app));
  assert.equal(result.installedVersion, "2.6.4");
  assert.equal(result.installedVersionSource, "lockfile");
});

function kotlinProject(root: string): DetectedProject {
  return { framework: "kotlin", frameworkLabel: "Kotlin (Android)", path: root, relativePath: ".", name: "fixture" };
}

test("reads the Android SDK version from a Gradle version catalog", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-catalog-"));
  mkdirSync(join(root, "gradle"));
  writeFileSync(join(root, "settings.gradle.kts"), 'include(":app")\n');
  writeFileSync(
    join(root, "gradle", "libs.versions.toml"),
    [
      "[versions]",
      'appstack = "1.8.0"',
      "[libraries]",
      'appstack-android-sdk = { group = "tech.appstack.android-sdk", name = "appstack-android-sdk", version.ref = "appstack" }',
    ].join("\n"),
  );
  const result = inspectProject(kotlinProject(root));
  assert.equal(result.installed, true);
  assert.equal(result.installedVersion, "1.8.0");

  writeFileSync(
    join(root, "gradle", "libs.versions.toml"),
    '[libraries]\nappstack = { module = "tech.appstack.android-sdk:appstack-android-sdk", version = "1.11.0" }\n',
  );
  assert.equal(inspectProject(kotlinProject(root)).installedVersion, "1.11.0");
});

test("scans source files in deep Android package directories", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-deep-"));
  const deep = join(root, "app", "src", "main", "java", "com", "example", "coffee", "billing", "tracking");
  mkdirSync(deep, { recursive: true });
  writeFileSync(join(root, "settings.gradle.kts"), 'include(":app")\n');
  writeFileSync(join(deep, "Tracker.kt"), "AppstackAttributionSdk.sendEvent(EventType.LOGIN)\n");
  assert.equal(inspectProject(kotlinProject(root)).eventCallCount, 1);
});

test("does not treat another vendor's pk_ key as an Appstack key", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-superwall-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: {} }));
  writeFileSync(
    join(root, "app.tsx"),
    [
      "Superwall.configure({ apiKey: 'pk_d1f0a2b3c4d5e6f7a8b9' });",
      "const appstackKey = 'pk_legacyAppstack123456';",
    ].join("\n"),
  );
  const result = inspectProject(reactNativeProject(root));
  assert.deepEqual(result.findings.find((item) => item.code === "hardcoded-api-key")?.files, ["app.tsx"]);

  writeFileSync(join(root, "app.tsx"), "Superwall.configure({ apiKey: 'pk_d1f0a2b3c4d5e6f7a8b9' });\n");
  assert.equal(
    inspectProject(reactNativeProject(root)).findings.some((item) => item.code === "hardcoded-api-key"),
    false,
  );
});

test("detects one legacy key reused across platforms in EAS build profiles", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-eas-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { expo: "54.0.0" } }));
  writeFileSync(
    join(root, "eas.json"),
    JSON.stringify({ build: { production: { env: {
      APPSTACK_IOS_API_KEY: "pk_sharedLegacy123456",
      APPSTACK_ANDROID_API_KEY: "pk_sharedLegacy123456",
    } } } }),
  );
  const result = inspectProject(reactNativeProject(root));
  assert.deepEqual(
    result.findings.find((item) => item.code === "api-key-reused-across-platforms")?.files,
    ["eas.json"],
  );
  assert.equal(JSON.stringify(result).includes("sharedLegacy123456"), false);
});

test("detects iOS and Android key variables wired to the wrong platform", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-crosswired-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: {} }));
  writeFileSync(
    join(root, "app.config.ts"),
    "export default { extra: { iosApiKey: process.env.APPSTACK_ANDROID_API_KEY } };\n",
  );
  writeFileSync(
    join(root, "keys.ts"),
    "Platform.select({ ios: Config.APPSTACK_IOS_API_KEY, android: Config.APPSTACK_ANDROID_API_KEY });\n",
  );
  const result = inspectProject(reactNativeProject(root));
  assert.deepEqual(
    result.findings.find((item) => item.code === "api-key-env-crosswired")?.files,
    ["app.config.ts"],
  );
});

test("reports 2.x call shapes that throw on React Native SDK 3.x", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-rn3-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { "react-native-appstack-sdk": "3.4.0" } }),
  );
  writeFileSync(join(root, "app.tsx"), "AppstackSDK.sendEvent('CUSTOM', 'session_attributes', {});\n");
  const removed = inspectProject(reactNativeProject(root)).findings.find(
    (item) => item.code === "react-native-removed-api",
  );
  assert.equal(removed?.severity, "error");

  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { "react-native-appstack-sdk": "2.6.0" } }),
  );
  assert.equal(
    inspectProject(reactNativeProject(root)).findings.some((item) => item.code === "react-native-removed-api"),
    false,
  );
});

test("detects RevenueCat and Superwall from dependencies", () => {
  const root = mkdtempSync(join(tmpdir(), "appstack-inspect-partners-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { "react-native-purchases": "9.12.0", "expo-superwall": "1.0.5" } }),
  );
  assert.deepEqual(inspectProject(reactNativeProject(root)).partners, ["revenuecat", "superwall"]);
});
