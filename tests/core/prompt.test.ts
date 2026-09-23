import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { Inspection } from "@/core/sdk/inspect";
import { buildPrompt } from "@/core/agent/prompt";
import { loadSkillFromRoot } from "@/core/agent/skill";

const skillRoot = fileURLToPath(
  new URL("../fixtures/appstack-sdk", import.meta.url),
);

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
  partners: [],
  findings: [],
};
const skill = loadSkillFromRoot(skillRoot, "swift");

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
  assert.match(prompt, /pk_android_ key for iOS/);
  assert.match(prompt, /For Expo CNG, inspect app config/);
  assert.match(prompt, /Report proven reuse as a warning/);
  assert.match(prompt, /Wrong-platform or reused API keys are configuration warnings to fix, but they do not break attribution/);
  assert.match(prompt, /actual key assignments cannot be verified from the repo/);
  assert.match(prompt, /same legacy key is never valid for both platforms/);
  assert.match(prompt, /Do not fill Needs confirmation with optional event coverage/);
  assert.match(prompt, /Do not require checking its return value/);
  assert.match(prompt, /Needs confirmation/);
});

test("verbose review requests the exhaustive report", () => {
  const prompt = buildPrompt({ workflow: "review", inspection, skill, verbose: true });
  assert.match(prompt, /Setup health/);
  assert.match(prompt, /Opportunities/);
  assert.match(prompt, /trace each target's API key configuration/);
  assert.match(prompt, /For Expo CNG, inspect app config/);
  assert.match(prompt, /legacy pk_ keys are also valid but their text does not identify the platform/);
});

test("all workflows treat customerUserId as optional cross-system mapping", () => {
  for (const workflow of ["integrate", "review", "upgrade"] as const) {
    const prompt = buildPrompt({ workflow, inspection, skill });
    assert.match(prompt, /customerUserId is optional/);
    assert.match(prompt, /Attribution does not require it/);
    assert.match(prompt, /Do not add it or report its absence as a finding/);
  }
});

test("all workflows treat the user_attributes event name as an example", () => {
  for (const workflow of ["integrate", "review", "upgrade"] as const) {
    const prompt = buildPrompt({ workflow, inspection, skill });
    assert.match(prompt, /User attributes can be received from any event/);
    assert.match(prompt, /Do not flag or request confirmation about a custom event's name or casing/);
    assert.match(prompt, /Assess parameter keys and values separately/);
  }
});

test("all workflows treat configure return as an acknowledgment", () => {
  for (const workflow of ["integrate", "review", "upgrade"] as const) {
    const prompt = buildPrompt({ workflow, inspection, skill });
    assert.match(prompt, /asynchronous SDK setup can continue afterward/);
    assert.match(prompt, /do not require callers to inspect a boolean or void return/);
    assert.match(prompt, /Verify key presence and platform selection instead/);
  }
});

test("all workflows describe key mix-ups as warnings without claiming lost attribution", () => {
  for (const workflow of ["integrate", "review", "upgrade"] as const) {
    const prompt = buildPrompt({ workflow, inspection, skill });
    assert.match(prompt, /Wrong-platform or reused Appstack keys are warnings to correct/);
    assert.match(prompt, /they do not break attribution/);
    assert.match(prompt, /Do not claim they cause rejected events, missing attribution, or lost revenue/);
    assert.match(prompt, /do not ask whether one legacy key might be valid for both/);
  }
});

test("integration keeps identical supplied keys available while requesting a correction", () => {
  const prompt = buildPrompt({
    workflow: "integrate",
    inspection,
    skill,
    apiKeys: { ios: true, android: true, samePlatformKey: true },
  });
  assert.match(prompt, /supplied iOS and Android keys are identical/);
  assert.match(prompt, /Continue with the supplied values/);
  assert.doesNotMatch(prompt, /pk_[A-Za-z0-9_-]{12,}/);
});

test("composes only the requested task references after the platform reference", () => {
  const composed = loadSkillFromRoot(skillRoot, "swift", ["review-troubleshooting", "event-design"]);
  assert.match(composed, /already contains references\/swift\.md, references\/review-troubleshooting\.md, references\/event-design\.md/);
  assert.match(composed, /# Review and troubleshooting fixture/);
  assert.match(composed, /# Event design fixture/);
  assert.doesNotMatch(composed, /# Partner integrations fixture/);
  assert.ok(composed.indexOf("Appstack Swift SDK") < composed.indexOf("Review and troubleshooting fixture"));
});

test("default review asks for severity-ordered findings", () => {
  const prompt = buildPrompt({ workflow: "review", inspection, skill });
  assert.match(prompt, /\*\*\[High\]\*\*/);
  assert.match(prompt, /Order High before Medium before Low/);
  assert.match(prompt, /drop the lowest severity first/);
  assert.match(prompt, /missing Appstack attribution wiring for that partner is a finding/);
  assert.match(prompt, /an unchecked return is never a finding/);
  assert.match(prompt, /High: the app fails to build/);
  assert.match(prompt, /Never ask about dev\/prod environment mapping/);
});

test("implementation workflows request a fixed report shape without rule narration", () => {
  for (const workflow of ["integrate", "upgrade"] as const) {
    const prompt = buildPrompt({ workflow, inspection, skill });
    assert.match(prompt, /- Verified: the commands you ran/);
    assert.match(prompt, /- You need to:/);
    assert.match(prompt, /do not describe rules you followed/);
  }
  const integrate = buildPrompt({ workflow: "integrate", inspection, skill });
  assert.match(integrate, /where each supplied key is stored/);
  assert.match(integrate, /skip configure with a logged message/);
  assert.match(integrate, /Expo Go cannot load the SDK/);
  assert.match(integrate, /inside the app directory/);
});

test("key-assignment rules are scoped to apps that target both platforms", () => {
  const prompt = buildPrompt({ workflow: "upgrade", inspection, skill });
  assert.match(prompt, /For a single-platform app, do not add key-assignment warnings or sections/);
  assert.doesNotMatch(prompt, /trace which distinct key reaches each target/);
});
