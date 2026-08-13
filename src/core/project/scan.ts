import { basename, dirname, join, relative, sep } from "node:path";
import fg from "fast-glob";
import { FRAMEWORK_LABEL, type FrameworkId } from "@/constants";
import { readJson, readText } from "@/util";

const IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/Pods/**",
  "**/.dart_tool/**",
  "**/.build/**",
  "**/build/**",
  "**/DerivedData/**",
  "**/Library/**",
];

export interface DetectedProject {
  framework: FrameworkId;
  frameworkLabel: string;
  path: string;
  relativePath: string;
  name: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function packageDeps(path: string): Record<string, string> {
  const value = readJson<PackageJson>(path);
  return { ...value?.devDependencies, ...value?.dependencies };
}

function project(
  root: string,
  path: string,
  framework: FrameworkId,
): DetectedProject {
  const relativePath = relative(root, path) || ".";
  return {
    framework,
    frameworkLabel: FRAMEWORK_LABEL[framework],
    path,
    relativePath,
    name: relativePath === "." ? basename(root) : basename(path),
  };
}

function inside(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}${sep}`);
}

export async function scanProjects(root: string): Promise<DetectedProject[]> {
  const opts = { cwd: root, absolute: true, ignore: IGNORE, deep: 7 } as const;
  const [packages, pubspecs, unityVersions, xcodes, gradleSettings] =
    await Promise.all([
      fg("**/package.json", opts),
      fg("**/pubspec.yaml", opts),
      fg("**/ProjectSettings/ProjectVersion.txt", opts),
      fg("**/*.xcodeproj", { ...opts, onlyDirectories: true }),
      fg("**/settings.gradle{,.kts}", opts),
    ]);

  const results: DetectedProject[] = [];
  const wrapperRoots: string[] = [];

  for (const manifest of packages) {
    const path = dirname(manifest);
    const deps = packageDeps(manifest);
    if ("react-native" in deps || "expo" in deps) {
      results.push(project(root, path, "react-native"));
      wrapperRoots.push(path);
    }
  }

  for (const manifest of pubspecs) {
    const path = dirname(manifest);
    const text = readText(manifest) ?? "";
    if (/^\s*flutter:\s*$/m.test(text) || /sdk:\s*flutter/.test(text)) {
      results.push(project(root, path, "flutter"));
      wrapperRoots.push(path);
    }
  }

  for (const versionFile of unityVersions) {
    const path = dirname(dirname(versionFile));
    results.push(project(root, path, "unity"));
    wrapperRoots.push(path);
  }

  for (const xcode of xcodes) {
    const path = dirname(xcode);
    if (!wrapperRoots.some((wrapper) => inside(path, wrapper))) {
      results.push(project(root, path, "swift"));
    }
  }

  for (const settings of gradleSettings) {
    const path = dirname(settings);
    if (!wrapperRoots.some((wrapper) => inside(path, wrapper))) {
      results.push(project(root, path, "kotlin"));
    }
  }

  const unique = new Map<string, DetectedProject>();
  for (const item of results) unique.set(`${item.framework}:${item.path}`, item);
  return [...unique.values()].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  );
}

export async function resolveProject(
  root: string,
  requestedFramework?: string,
): Promise<DetectedProject> {
  const projects = await scanProjects(root);
  const matches = requestedFramework
    ? projects.filter((item) => item.framework === requestedFramework)
    : projects;
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) {
    throw new Error(
      requestedFramework
        ? `No ${requestedFramework} app found under ${root}.`
        : `No supported Appstack app found under ${root}.`,
    );
  }
  const choices = matches
    .map((item) => `  ${item.framework.padEnd(13)} ${item.relativePath}`)
    .join("\n");
  throw new Error(
    `Multiple apps found. Run from one app directory or pass --framework.\n${choices}`,
  );
}
