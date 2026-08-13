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

test("API key values never enter generated or copied prompts", () => {
  const secret = "pk_test_must_not_appear_123456";
  const availability = { generic: Boolean(secret), ios: false, android: false };
  const headless = buildPrompt({
    workflow: "integrate",
    inspection,
    apiKeys: availability,
  });
  const copied = buildPrompt({
    workflow: "integrate",
    inspection,
    apiKeys: availability,
    copyMode: true,
  });

  assert.doesNotMatch(headless, new RegExp(secret));
  assert.doesNotMatch(copied, new RegExp(secret));
  assert.match(headless, /APPSTACK_API_KEY/);
  assert.match(copied, /values are intentionally omitted/);
});
