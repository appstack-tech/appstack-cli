import type { FrameworkId } from "@/constants";
import type { Inspection } from "@/core/sdk/inspect";
import type { LatestVersion } from "@/core/sdk/latest";
import { loadSkill } from "./skill";

export type WorkflowId = "integrate" | "review" | "upgrade";

export interface PromptOptions {
  workflow: WorkflowId;
  inspection: Inspection;
  latest?: LatestVersion;
  apiKeys?: { generic?: boolean; ios?: boolean; android?: boolean };
  copyMode?: boolean;
}

function inspectionText(inspection: Inspection): string {
  const findings = inspection.findings.length
    ? inspection.findings
        .map((item) => `- [${item.severity}] ${item.code}: ${item.message}`)
        .join("\n")
    : "- No deterministic findings.";
  return [
    `Framework: ${inspection.project.frameworkLabel}`,
    `App path: ${inspection.project.path}`,
    `Installed SDK version: ${inspection.installedVersion ?? "not detected"}`,
    `Configure calls: ${inspection.configureCount}`,
    `Event calls: ${inspection.eventCallCount}`,
    "Deterministic findings:",
    findings,
  ].join("\n");
}

function keyContext(
  keys: PromptOptions["apiKeys"],
  copyMode: boolean,
): string {
  if (!keys?.generic && !keys?.ios && !keys?.android) {
    return "No API key was supplied. Use an existing project environment/config value; never invent a key. If integration cannot be completed without one, explain exactly what is needed.";
  }
  const variables = [
    keys.generic ? "APPSTACK_API_KEY" : undefined,
    keys.ios ? "APPSTACK_IOS_API_KEY" : undefined,
    keys.android ? "APPSTACK_ANDROID_API_KEY" : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  return copyMode
    ? `API key values are intentionally omitted from this copied playbook. Make ${variables} available in the destination agent's environment without printing their values.`
    : `API key values are available in the agent environment as ${variables}. Read only the variables needed for configuration and never print their values.`;
}

function task(options: PromptOptions): string {
  switch (options.workflow) {
    case "integrate":
      return `Integrate the Appstack SDK into this app. Make the smallest coherent set of edits. Detect and use the existing package manager and startup architecture. Configure exactly once, keep keys out of committed source using the project's established configuration mechanism, resolve dependencies, and run the narrowest meaningful build or tests. Do not add speculative events.\n\nAPI key context:\n${keyContext(options.apiKeys, Boolean(options.copyMode))}`;
    case "review":
      return "Review the existing Appstack integration end to end. Do not modify files. Verify every claim against code or project configuration. Return concise markdown with: Setup health, Findings ordered by impact, Opportunities, Not verified, and Overall. Include absolute clickable file:line evidence for findings.";
    case "upgrade": {
      const latest = options.latest?.version ?? "not resolved by the CLI";
      const source = options.latest?.source ?? "unknown source";
      return `Upgrade this app's Appstack SDK from ${options.inspection.installedVersion ?? "an unknown version"} to ${latest} (${source}). Confirm the target version from the official registry before editing. Read release notes and migration guidance for every crossed version, update the dependency and lockfiles using the project's package manager, migrate deprecated or breaking calls, and run the narrowest meaningful build or tests. Do not change unrelated code.`;
    }
  }
}

export function buildPrompt(options: PromptOptions): string {
  const statusRules = options.copyMode
    ? ""
    : "Before each tool call, emit one short progress line prefixed with `[STATUS] `. End implementation tasks with `[STATUS] Done`.";
  return [
    "<appstack-cli>",
    task(options),
    "",
    inspectionText(options.inspection),
    "",
    "Operating rules:",
    "- Read a file before editing it and preserve the project's style.",
    "- Do not refactor or reformat unrelated code.",
    "- Never print or expose API-key values in the final response or command output.",
    "- Stop and explain ambiguity instead of guessing about app startup, build targets, or keys.",
    statusRules,
    "</appstack-cli>",
    "",
    loadSkill(options.inspection.project.framework as FrameworkId),
  ]
    .filter((line) => line !== "")
    .join("\n");
}
