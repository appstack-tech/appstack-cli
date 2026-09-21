import assert from "node:assert/strict";
import test from "node:test";
import { selectDriver } from "@/core/agent";
import type { AgentDriver, DriverId } from "@/core/agent/types";

function driver(id: DriverId, displayName: string): AgentDriver {
  return {
    id,
    displayName,
    detect: async () => true,
    run: async () => ({ ok: true }),
  };
}

const claude = driver("claude", "Claude Code");
const codex = driver("codex", "Codex");

test("selects the only detected coding agent", () => {
  assert.equal(selectDriver([codex]), codex);
});

test("requires a selection when multiple coding agents are detected", () => {
  assert.throws(
    () => selectDriver([claude, codex]),
    /Multiple coding agents detected: Claude Code, Codex.*--agent <name>/,
  );
});

test("honors an explicit coding-agent selection", () => {
  assert.equal(selectDriver([claude, codex], "codex"), codex);
});

test("reports an unavailable explicit coding-agent selection", () => {
  assert.throws(
    () => selectDriver([claude], "codex"),
    /codex is not available\. Detected: claude\./,
  );
});
