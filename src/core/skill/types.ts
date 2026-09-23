import type { FrameworkId } from "@/constants";

export const REQUIRED_SKILL_FILES = [
  "SKILL.md",
  "references/swift.md",
  "references/kotlin.md",
  "references/react-native.md",
  "references/flutter.md",
  "references/unity.md",
  "references/event-design.md",
  "references/partner-integrations.md",
  "references/review-troubleshooting.md",
] as const;

export type TaskReference = "event-design" | "partner-integrations" | "review-troubleshooting";

export interface SkillCacheState {
  activeRelease?: string;
  checkedAt?: string;
  failedAt?: string;
}

export interface ResolvedSkill {
  body: string;
  source: "cache" | "override";
  release?: string;
}

export interface ResolveSkillOptions {
  framework: FrameworkId;
  references?: TaskReference[];
  refresh: boolean;
  cacheRoot?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  now?: number;
}
