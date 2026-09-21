import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import fg from "fast-glob";
import type { FrameworkId } from "@/constants";
import type { DetectedProject } from "@/core/project/scan";
import { readJson, readText, stableVersion } from "@/util";

const IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/Pods/**",
  "**/.dart_tool/**",
  "**/.build/**",
  "**/build/**",
  "**/DerivedData/**",
  "**/Library/**",
  "**/AppstackSDK.xcframework/**",
];

const SOURCE_GLOBS: Record<FrameworkId, string[]> = {
  swift: ["**/*.swift", "**/project.pbxproj"],
  kotlin: ["**/*.{kt,kts,gradle}", "**/gradle.properties"],
  "react-native": ["**/*.{ts,tsx,js,jsx,json}", "**/*.{gradle,kts}"],
  flutter: ["**/*.dart", "**/*.{gradle,kts}", "**/*.yaml"],
  unity: ["Assets/**/*.cs", "Assets/**/*.asset", "Packages/manifest.json"],
};

const CONFIGURE: Record<FrameworkId, RegExp> = {
  swift: /AppstackAttributionSdk\.shared\.configure\s*\(/g,
  kotlin: /AppstackAttributionSdk\.configure\s*\(/g,
  "react-native": /AppstackSDK\.configure\s*\(/g,
  flutter: /AppstackPlugin\.configure\s*\(/g,
  unity: /AppstackSDK\.Configure\s*\(/g,
};

const EVENT_CALL: Record<FrameworkId, RegExp> = {
  swift: /sendEvent\s*\(/g,
  kotlin: /sendEvent\s*\(/g,
  "react-native": /sendEvent\s*\(/g,
  flutter: /sendEvent\s*\(/g,
  unity: /SendEvent\s*\(/g,
};

export type FindingSeverity = "error" | "warning" | "info";

export interface Finding {
  code: string;
  severity: FindingSeverity;
  message: string;
  files?: string[];
}

export interface Inspection {
  project: DetectedProject;
  installed: boolean;
  installedVersion?: string;
  installedVersionSource?: VersionSource;
  configureCount: number;
  eventCallCount: number;
  customEventNames: string[];
  findings: Finding[];
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
}

type VersionSource = "lockfile" | "manifest" | "resolved";

interface DetectedVersion {
  version?: string;
  source?: VersionSource;
}

function dependencyVersion(path: string, name: string): string | undefined {
  const json = readJson<PackageJson>(path);
  return stableVersion(json?.dependencies?.[name] ?? json?.devDependencies?.[name]);
}

function npmLockedVersion(root: string, name: string): string | undefined {
  for (const filename of ["npm-shrinkwrap.json", "package-lock.json"]) {
    const lock = readJson<{
      packages?: Record<string, { version?: string }>;
      dependencies?: Record<string, { version?: string }>;
    }>(join(root, filename));
    const value =
      lock?.packages?.[`node_modules/${name}`]?.version ??
      lock?.dependencies?.[name]?.version;
    if (value) return stableVersion(value);
  }
  return undefined;
}

function yarnLockedVersion(root: string, name: string): string | undefined {
  const text = readText(join(root, "yarn.lock"));
  if (!text) return undefined;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = text.match(
    new RegExp(`^["']?${escaped}@[^\\n]+["']?:\\n((?:[ \\t]+[^\\n]*\\n?)*)`, "m"),
  )?.[1];
  return stableVersion(block?.match(/^\s*version(?:\s*:|\s+)\s*["']?([^\s"']+)/m)?.[1]);
}

function pnpmLockedVersion(root: string, name: string): string | undefined {
  const text = readText(join(root, "pnpm-lock.yaml"));
  if (!text) return undefined;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keyed = text.match(
    new RegExp(`^\\s{2}(?:/["']?)?${escaped}@([^:\\s"']+)["']?:`, "m"),
  )?.[1] ?? text.match(
    new RegExp(`^\\s{2}/["']?${escaped}/([^:\\s"']+)["']?:`, "m"),
  )?.[1];
  const importer = text.match(
    new RegExp(
      `^\\s{4}["']?${escaped}["']?:\\s*\\n[\\s\\S]{0,300}?^\\s{6,}version:\\s*["']?([^\\s"']+)`,
      "m",
    ),
  )?.[1];
  return stableVersion(importer ?? keyed);
}

function lockSearchRoots(root: string): string[] {
  const roots: string[] = [];
  let current = root;
  for (let depth = 0; depth < 8; depth++) {
    roots.push(current);
    if (existsSync(join(current, ".git"))) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return roots;
}

function reactNativeVersion(root: string): DetectedVersion {
  const name = "react-native-appstack-sdk";
  const packageManager = readJson<PackageJson>(join(root, "package.json"))?.packageManager;
  const resolvers = packageManager?.startsWith("pnpm@")
    ? [pnpmLockedVersion, npmLockedVersion, yarnLockedVersion]
    : packageManager?.startsWith("yarn@")
      ? [yarnLockedVersion, npmLockedVersion, pnpmLockedVersion]
      : [npmLockedVersion, yarnLockedVersion, pnpmLockedVersion];
  for (const lockRoot of lockSearchRoots(root)) {
    for (const resolver of resolvers) {
      const version = resolver(lockRoot, name);
      if (version) return { version, source: "lockfile" };
    }
  }
  const version = dependencyVersion(join(root, "package.json"), name);
  return { version, ...(version ? { source: "manifest" as const } : {}) };
}

function swiftVersion(root: string): string | undefined {
  const paths = fg.sync("**/Package.resolved", {
    cwd: root,
    absolute: true,
    ignore: IGNORE,
    deep: 7,
  });
  for (const path of paths) {
    const text = readText(path);
    if (!text || !/ios-appstack-sdk/i.test(text)) continue;
    type Pin = {
      identity?: string;
      package?: string;
      state?: { version?: string };
    };
    const parsed = readJson<{
      pins?: Pin[];
      object?: { pins?: Pin[] };
    }>(path);
    const pins = parsed?.pins ?? parsed?.object?.pins ?? [];
    const pin = pins.find((item) =>
      `${item.identity ?? ""} ${item.package ?? ""}`.toLowerCase().includes("appstack"),
    );
    if (pin?.state?.version) return pin.state.version;
  }
  return undefined;
}

function kotlinVersion(root: string): string | undefined {
  const files = fg.sync("**/*.{gradle,kts}", {
    cwd: root,
    absolute: true,
    ignore: IGNORE,
    deep: 7,
  });
  for (const file of files) {
    const match = readText(file)?.match(
      /tech\.appstack\.android-sdk:appstack-android-sdk:([0-9A-Za-z.+_-]+)/,
    );
    if (match?.[1]) return stableVersion(match[1]);
  }
  return undefined;
}

function flutterVersion(root: string): string | undefined {
  const lock = readText(join(root, "pubspec.lock"));
  const locked = lock?.match(
    /appstack_plugin:\s*[\s\S]*?version:\s*["']?([^\s"']+)/,
  )?.[1];
  if (locked) return stableVersion(locked);
  const manifest = readText(join(root, "pubspec.yaml"));
  return stableVersion(
    manifest?.match(/^\s*appstack_plugin:\s*([^\s#]+)/m)?.[1],
  );
}

function unityVersion(root: string): string | undefined {
  const manifest = readJson<{ dependencies?: Record<string, string> }>(
    join(root, "Packages", "manifest.json"),
  );
  const value = manifest?.dependencies?.["com.appstack.unity-sdk"];
  if (value?.startsWith("file:")) {
    const rawPath = value.slice("file:".length);
    const packagePath = isAbsolute(rawPath) ? rawPath : resolve(root, rawPath);
    return readJson<{ version?: string }>(join(packagePath, "package.json"))?.version;
  }
  return stableVersion(value);
}

function dependencyInstalled(project: DetectedProject): boolean {
  switch (project.framework) {
    case "react-native": {
      const json = readJson<PackageJson>(join(project.path, "package.json"));
      return Boolean(
        json?.dependencies?.["react-native-appstack-sdk"] ??
          json?.devDependencies?.["react-native-appstack-sdk"],
      );
    }
    case "flutter":
      return /(^|\n)\s*appstack_plugin\s*:/m.test(
        readText(join(project.path, "pubspec.yaml")) ?? "",
      );
    case "unity":
      return Boolean(
        readJson<{ dependencies?: Record<string, string> }>(
          join(project.path, "Packages", "manifest.json"),
        )?.dependencies?.["com.appstack.unity-sdk"],
      );
    case "swift":
      return fg
        .sync(["**/Package.resolved", "**/project.pbxproj", "Package.swift"], {
          cwd: project.path,
          absolute: true,
          ignore: IGNORE,
          deep: 7,
        })
        .some((file) => /(?:ios-appstack-sdk|AppstackSDK)/i.test(readText(file) ?? ""));
    case "kotlin":
      return fg
        .sync(["**/*.{gradle,kts}", "**/libs.versions.toml"], {
          cwd: project.path,
          absolute: true,
          ignore: IGNORE,
          deep: 7,
        })
        .some((file) => /(?:tech\.appstack|appstack-android-sdk)/i.test(readText(file) ?? ""));
  }
}

function detectedVersion(project: DetectedProject): DetectedVersion {
  switch (project.framework) {
    case "swift":
      return { version: swiftVersion(project.path), source: "resolved" };
    case "kotlin":
      return { version: kotlinVersion(project.path), source: "manifest" };
    case "react-native":
      return reactNativeVersion(project.path);
    case "flutter":
      return { version: flutterVersion(project.path), source: "resolved" };
    case "unity":
      return { version: unityVersion(project.path), source: "manifest" };
  }
}

export function installedVersion(project: DetectedProject): string | undefined {
  return detectedVersion(project).version;
}

function sourceFiles(project: DetectedProject): string[] {
  return fg.sync(SOURCE_GLOBS[project.framework], {
    cwd: project.path,
    absolute: true,
    ignore: IGNORE,
    deep: 8,
  });
}

function uniqueFiles(root: string, files: string[]): string[] {
  return [...new Set(files.map((file) => relative(root, file)))].sort();
}

export function inspectProject(project: DetectedProject): Inspection {
  const detected = detectedVersion(project);
  const version = detected.version;
  const files = sourceFiles(project);
  let configureCount = 0;
  let eventCallCount = 0;
  const configureFiles: string[] = [];
  const deprecatedFiles: string[] = [];
  const manualInstallFiles: string[] = [];
  const keyFiles: string[] = [];
  const customNames = new Set<string>();

  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const analyzed = text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const configs = [...analyzed.matchAll(CONFIGURE[project.framework])].length;
    const events = [...analyzed.matchAll(EVENT_CALL[project.framework])].length;
    configureCount += configs;
    eventCallCount += events;
    if (configs) configureFiles.push(file);
    const deprecatedNamed = /\b(?:isDebug|endpointBaseUrl)\s*[:=]/.test(analyzed);
    const deprecatedReactNativePositional =
      project.framework === "react-native" &&
      /AppstackSDK\.configure\s*\([^,]+,\s*(?:true|false)\b/s.test(analyzed);
    if (deprecatedNamed || deprecatedReactNativePositional) deprecatedFiles.push(file);
    if (
      /(?:EventType\.)?INSTALL\b|\.install\b/.test(analyzed) &&
      /(?:sendEvent|SendEvent)[\s\S]{0,100}(?:INSTALL|\.install)/.test(analyzed)
    ) {
      manualInstallFiles.push(file);
    }
    if (/\bpk_[A-Za-z0-9_-]{12,}\b/.test(analyzed)) keyFiles.push(file);

    const customPatterns = [
      /(?:CUSTOM|\.custom)[\s\S]{0,120}?(?:eventName|name)\s*[:=]\s*["']([^"']+)["']/g,
      /(?:["']CUSTOM["']|(?:EventType\.)?CUSTOM|\.custom)\s*,\s*["']([^"']+)["']/g,
    ];
    for (const pattern of customPatterns) {
      for (const match of analyzed.matchAll(pattern)) if (match[1]) customNames.add(match[1]);
    }
  }

  const unitySettings =
    project.framework === "unity" &&
    fg.sync("Assets/**/AppstackSettings.asset", {
      cwd: project.path,
      ignore: IGNORE,
      deep: 8,
    }).length > 0;
  const configured = configureCount > 0 || unitySettings;
  const installed = dependencyInstalled(project);
  const findings: Finding[] = [];

  if (!installed) {
    findings.push({
      code: "sdk-not-installed",
      severity: "error",
      message: "The Appstack SDK dependency was not found.",
    });
  }
  if (!configured) {
    findings.push({
      code: "configure-missing",
      severity: "error",
      message: "No Appstack SDK initialization was found.",
    });
  }
  if (configureCount > 1) {
    findings.push({
      code: "configure-duplicate",
      severity: "warning",
      message: `Found ${configureCount} configure calls; Appstack should be configured exactly once.`,
      files: uniqueFiles(project.path, configureFiles),
    });
  }
  if (deprecatedFiles.length) {
    findings.push({
      code: "deprecated-config-options",
      severity: "warning",
      message: "Deprecated isDebug or endpointBaseUrl configuration was found; current SDKs ignore these options.",
      files: uniqueFiles(project.path, deprecatedFiles),
    });
  }
  if (manualInstallFiles.length) {
    findings.push({
      code: "manual-install-event",
      severity: "error",
      message: "INSTALL is automatic and must not be sent manually.",
      files: uniqueFiles(project.path, manualInstallFiles),
    });
  }
  if (keyFiles.length) {
    findings.push({
      code: "hardcoded-api-key",
      severity: "warning",
      message: "A likely Appstack API key is hardcoded in source. Prefer the platform's environment/config mechanism.",
      files: uniqueFiles(project.path, keyFiles),
    });
  }
  if (customNames.size > 10) {
    findings.push({
      code: "custom-event-sprawl",
      severity: "warning",
      message: `Found ${customNames.size} distinct custom event names; review whether standard attribution events should replace them.`,
    });
  }

  return {
    project,
    installed,
    installedVersion: version,
    installedVersionSource: detected.source,
    configureCount,
    eventCallCount,
    customEventNames: [...customNames].sort(),
    findings,
  };
}
