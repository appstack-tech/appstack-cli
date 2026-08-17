import type { FrameworkId } from "@/constants";

export const SKILL_SCHEMA_VERSION = 1;

export const REQUIRED_SKILL_FILES = [
  "SKILL.md",
  "references/swift.md",
  "references/kotlin.md",
  "references/react-native.md",
  "references/flutter.md",
  "references/unity.md",
] as const;

export interface SkillRuntimeManifest {
  schemaVersion: number;
  minimumCliVersion: string;
  files: string[];
}

export interface SkillCacheState {
  activeSha?: string;
  checkedAt?: string;
  failedAt?: string;
}

export interface ResolvedSkill {
  body: string;
  source: "bundled" | "cache" | "override";
  sha?: string;
}

export interface ResolveSkillOptions {
  framework: FrameworkId;
  refresh: boolean;
  cacheRoot?: string;
  bundledRoot?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  now?: number;
}
