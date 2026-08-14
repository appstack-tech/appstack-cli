import assert from "node:assert/strict";
import test from "node:test";
import type { Inspection } from "@/core/sdk/inspect";
import { buildPrompt } from "@/core/agent/prompt";

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

test("composes the shared skill with exactly the selected platform reference", () => {
  const prompt = buildPrompt({ workflow: "review", inspection });
  assert.match(prompt, /Appstack SDK integration/);
  assert.match(prompt, /Appstack Swift SDK \(iOS\)/);
  assert.doesNotMatch(prompt, /# Appstack Unity SDK/);
  assert.match(prompt, /Do not modify files/);
});

test("copy mode omits the headless status protocol", () => {
  const prompt = buildPrompt({ workflow: "integrate", inspection, copyMode: true });
  assert.doesNotMatch(prompt, /Before each tool call/);
});

test("copy mode never renders supplied API-key values", () => {
  const prompt = buildPrompt({
    workflow: "integrate",
    inspection,
    apiKeys: { generic: "secret-value" },
    copyMode: true,
  });

  assert.doesNotMatch(prompt, /secret-value/);
});
