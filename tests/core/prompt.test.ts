import assert from "node:assert/strict";
import test from "node:test";
import type { Inspection } from "@/core/sdk/inspect";
import { buildPrompt } from "@/core/agent/prompt";
import { loadSkill } from "@/core/agent/skill";

const inspection: Inspection = {
  project: {
    framework: "swift",
    frameworkLabel: "Swift (iOS)",
    path: "/tmp/example",
    relativePath: ".",
    name: "example",
  },
  installed: true,
  installedVersion: "4.4.0",
  configureCount: 1,
  eventCallCount: 3,
  customEventNames: [],
  findings: [],
};
const skill = loadSkill("swift");

test("composes the shared skill with exactly the selected platform reference", () => {
  const prompt = buildPrompt({ workflow: "review", inspection, skill });
  assert.match(prompt, /Appstack SDK integration/);
  assert.match(prompt, /Appstack Swift SDK \(iOS\)/);
  assert.doesNotMatch(prompt, /# Appstack Unity SDK/);
  assert.match(prompt, /Do not modify files/);
});

test("copy mode omits the headless status protocol", () => {
  const prompt = buildPrompt({ workflow: "integrate", inspection, skill, copyMode: true });
  assert.doesNotMatch(prompt, /Before each tool call/);
});

test("copy mode identifies available keys without embedding values", () => {
  const prompt = buildPrompt({
    workflow: "integrate",
    inspection,
    skill,
    apiKeys: { generic: true },
    copyMode: true,
  });

  assert.match(prompt, /APPSTACK_API_KEY/);
  assert.match(prompt, /values are intentionally omitted/);
});

test("default review is capped and distinguishes findings from uncertainty", () => {
  const prompt = buildPrompt({ workflow: "review", inspection, skill });
  assert.match(prompt, /at most 5 verified, actionable problems/);
  assert.match(prompt, /Do not classify absent checked-in API keys as a finding/);
  assert.match(prompt, /Ignoring configure\(\)'s boolean return is not automatically a finding/);
  assert.match(prompt, /Needs confirmation/);
});

test("verbose review requests the exhaustive report", () => {
  const prompt = buildPrompt({ workflow: "review", inspection, skill, verbose: true });
  assert.match(prompt, /Setup health/);
  assert.match(prompt, /Opportunities/);
});
