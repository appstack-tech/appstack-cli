import assert from "node:assert/strict";
import test from "node:test";
import { claudeArgs, claudeSucceeded } from "@/core/agent/drivers/claude";
import { codexArgs } from "@/core/agent/drivers/codex";
import {
  opencodeArgs,
  opencodePermissions,
} from "@/core/agent/drivers/opencode";
import { piArgs, piTools } from "@/core/agent/drivers/pi";
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

test("Claude's explicit result remains authoritative when the process exits zero", () => {
  assert.equal(claudeSucceeded(false, { code: 0, signal: null }), false);
  assert.equal(claudeSucceeded(true, { code: 0, signal: null }), true);
  assert.equal(claudeSucceeded(true, { code: 1, signal: null }), false);
});

test("OpenCode review denies mutation and shell permissions", () => {
  const review = options("read");
  const permissions = opencodePermissions(review);
  assert.equal(permissions["*"], "deny");
  assert.equal(permissions.edit, "deny");
  assert.equal(permissions.bash, "deny");
  assert.equal(permissions.external_directory, "deny");
  assert.deepEqual(opencodeArgs(review).slice(0, 7), [
    "run",
    "--pure",
    "--format",
    "json",
    "--dir",
    review.cwd,
    "--auto",
  ]);
});

test("OpenCode integration allows edits and shell inside the project", () => {
  const permissions = opencodePermissions(options("write"));
  assert.equal(permissions.edit, "allow");
  assert.equal(permissions.bash, "allow");
  assert.equal(permissions.external_directory, "deny");
});

test("Pi review exposes only read-only tools", () => {
  const review = options("read");
  assert.deepEqual(piTools(review), ["read", "grep", "find", "ls"]);
  const args = piArgs(review);
  assert.equal(args[args.indexOf("--tools") + 1], "read,grep,find,ls");
  assert.equal(args.includes("--no-extensions"), true);
  assert.equal(args.includes("--no-skills"), true);
});

test("Pi integration enables editing and the platform shell", () => {
  const tools = piTools(options("write"));
  assert.equal(tools.includes("edit"), true);
  assert.equal(tools.includes("write"), true);
  assert.equal(tools.includes(process.platform === "win32" ? "powershell" : "bash"), true);
});
