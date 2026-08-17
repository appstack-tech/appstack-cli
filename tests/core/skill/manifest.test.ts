import assert from "node:assert/strict";
import test from "node:test";
import { parseSkillManifest } from "@/core/skill/manifest";
import { REQUIRED_SKILL_FILES } from "@/core/skill/types";

function manifest(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 1,
    minimumCliVersion: "0.1.0",
    files: [...REQUIRED_SKILL_FILES],
    ...overrides,
  };
}

test("accepts a compatible runtime manifest", () => {
  assert.deepEqual(parseSkillManifest(manifest()), manifest());
});

test("rejects incompatible schemas and CLI versions", () => {
  assert.throws(
    () => parseSkillManifest(manifest({ schemaVersion: 2 })),
    /Unsupported skill schema/,
  );
  assert.throws(
    () => parseSkillManifest(manifest({ minimumCliVersion: "99.0.0" })),
    /requires Appstack CLI 99.0.0/,
  );
});

test("rejects missing files and unsafe paths", () => {
  assert.throws(
    () => parseSkillManifest(manifest({ files: ["SKILL.md"] })),
    /missing references\/swift\.md/,
  );
  assert.throws(
    () =>
      parseSkillManifest(
        manifest({ files: [...REQUIRED_SKILL_FILES, "../outside.md"] }),
      ),
    /invalid file paths/,
  );
  assert.throws(
    () =>
      parseSkillManifest(
        manifest({ files: [...REQUIRED_SKILL_FILES, "references\\outside.md"] }),
      ),
    /invalid file paths/,
  );
  assert.throws(
    () =>
      parseSkillManifest(
        manifest({ files: [...REQUIRED_SKILL_FILES, "references/file.md?raw=1"] }),
      ),
    /invalid file paths/,
  );
  assert.throws(
    () =>
      parseSkillManifest(manifest({ files: [...REQUIRED_SKILL_FILES, "."] })),
    /invalid file paths/,
  );
});
