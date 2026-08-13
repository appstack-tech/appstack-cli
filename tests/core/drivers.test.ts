import assert from "node:assert/strict";
import test from "node:test";
import { claudeArgs } from "@/core/agent/drivers/claude";
import { codexArgs } from "@/core/agent/drivers/codex";
import type { AgentOptions } from "@/core/agent/types";

function options(mode: "read" | "write"): AgentOptions {
  return {
    prompt: "review",
    cwd: "/tmp/example",
    capabilities: {
      filesystem: mode,
      network: true,
      shell: mode === "read" ? "read-only" : "unrestricted",
    },
  };
}

test("Claude review runs in plan mode without write tools", () => {
  const args = claudeArgs(options("read"));
  assert.equal(args.includes("plan"), true);
  assert.doesNotMatch(args.join(" "), /Write,Edit/);
});

test("Codex review uses the read-only sandbox", () => {
  const args = codexArgs(options("read"), "/tmp/output");
  assert.equal(args[args.indexOf("--sandbox") + 1], "read-only");
});

test("Codex integration uses workspace-write", () => {
  const args = codexArgs(options("write"), "/tmp/output");
  assert.equal(args[args.indexOf("--sandbox") + 1], "workspace-write");
});
