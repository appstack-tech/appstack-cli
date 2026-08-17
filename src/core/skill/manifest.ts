import { posix } from "node:path";
import { VERSION } from "@/constants";
import { compareVersions, isValidVersion } from "@/core/sdk/latest";
import {
  REQUIRED_SKILL_FILES,
  SKILL_SCHEMA_VERSION,
  type SkillRuntimeManifest,
} from "./types";

const MAX_FILES = 32;

function isSafeRelativePath(path: string): boolean {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    /^[A-Za-z]:/.test(path) ||
    !/^[A-Za-z0-9._/-]+$/.test(path)
  ) {
    return false;
  }
  const normalized = posix.normalize(path);
  return (
    normalized === path &&
    normalized !== "." &&
    normalized !== ".." &&
    !normalized.startsWith("../")
  );
}

export function parseSkillManifest(
  value: unknown,
  cliVersion = VERSION,
): SkillRuntimeManifest {
  if (!value || typeof value !== "object") {
    throw new Error("The skill runtime manifest is not an object.");
  }
  const manifest = value as Partial<SkillRuntimeManifest>;
  if (manifest.schemaVersion !== SKILL_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported skill schema ${String(manifest.schemaVersion)}; expected ${SKILL_SCHEMA_VERSION}.`,
    );
  }
  if (
    typeof manifest.minimumCliVersion !== "string" ||
    !isValidVersion(manifest.minimumCliVersion)
  ) {
    throw new Error("The skill runtime manifest has an invalid minimumCliVersion.");
  }
  if (compareVersions(cliVersion, manifest.minimumCliVersion) < 0) {
    throw new Error(
      `The skill requires Appstack CLI ${manifest.minimumCliVersion} or newer.`,
    );
  }
  if (
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0 ||
    manifest.files.length > MAX_FILES ||
    manifest.files.some((path) => typeof path !== "string" || !isSafeRelativePath(path))
  ) {
    throw new Error("The skill runtime manifest contains invalid file paths.");
  }
  const files = [...new Set(manifest.files)];
  for (const required of REQUIRED_SKILL_FILES) {
    if (!files.includes(required)) {
      throw new Error(`The skill runtime manifest is missing ${required}.`);
    }
  }
  return {
    schemaVersion: manifest.schemaVersion,
    minimumCliVersion: manifest.minimumCliVersion,
    files,
  };
}
