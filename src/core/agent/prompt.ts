import type { Inspection } from "@/core/sdk/inspect";
import type { LatestVersion } from "@/core/sdk/latest";

export type WorkflowId = "integrate" | "review" | "upgrade";

export interface PromptOptions {
  workflow: WorkflowId;
  inspection: Inspection;
  latest?: LatestVersion;
  skill: string;
  apiKeys?: { generic?: boolean; ios?: boolean; android?: boolean };
  copyMode?: boolean;
  verbose?: boolean;
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
      return `Integrate the Appstack SDK into this app. Make the smallest coherent set of edits. Detect and use the existing package manager and startup architecture. Configure exactly once, keep keys out of committed source using the project's established configuration mechanism, resolve dependencies, and run the narrowest meaningful build or tests. For apps targeting both iOS and Android, ensure each target receives a distinct key supplied for that platform through the existing configuration path. A pk_ios_ or pk_android_ prefix identifies a platform; legacy pk_ keys are also valid but their text does not identify the platform. Do not add speculative events.\n\nAPI key context:\n${keyContext(options.apiKeys, Boolean(options.copyMode))}`;
    case "review":
      return options.verbose
        ? "Review the existing Appstack integration end to end. Do not modify files. Verify every claim against code or project configuration. In apps targeting both iOS and Android, trace each target's API key configuration and verify that the keys are distinct. A pk_ios_ or pk_android_ prefix identifies a platform; legacy pk_ keys are also valid but their text does not identify the platform. For Expo CNG, inspect app config, config plugins, shared source, and build configuration because native directories may be generated. Report only a proven mismatch and never show key values. Return markdown with: Setup health, Findings ordered by impact, Opportunities, Needs confirmation, and Overall. Include absolute clickable file:line evidence for findings."
        : `Review the existing Appstack integration. Do not modify files.

Return a short markdown report only:
- Overall: one sentence.
- Findings: at most 5 verified, actionable problems, ordered by impact. For each give one-line Impact, Evidence (absolute clickable file:line), and Change.
- Needs confirmation: at most 3 consequential items that cannot be verified from the repository.

Strict classification rules:
- A finding must be proven from repository evidence and require a concrete change.
- Do not classify absent checked-in API keys as a finding; hosted build systems such as EAS may inject them. Put this under Needs confirmation only when consequential.
- In apps targeting both iOS and Android, trace platform branches and configuration references. Report a proven use of a pk_android_ key for iOS or a pk_ios_ key for Android, including a wrong platform environment variable wired to a target. Never include the full key value.
- Legacy pk_ keys without an ios or android prefix are valid and platform specific, but the value alone cannot identify which platform a distinct key belongs to. Report proven reuse of one key on both platforms; do not report a mismatch solely because a legacy key lacks the newer prefix. Put consequential uncertainty under Needs confirmation.
- For Expo CNG, inspect app config, config plugins, shared source, and build configuration; native directories may be absent or generated. Do not infer a missing key or mismatch merely from absent native files.
- configure() may return void or acknowledge the call before asynchronous SDK setup finishes. Do not require checking its return value or treat a resolved call as proof that setup is complete. Check only whether the app supplies a non-empty key for the correct platform and handles an immediate missing-key failure; do not flag subsequent SDK calls or a success log based solely on the return value.
- Missing optional events or consent-dependent matching parameters are opportunities, not findings, unless the app's intended behavior proves they are required.
- Omit healthy checks, exhaustive inventories, low-value observations, and optional improvements from the default report.`;
    case "upgrade": {
      const latest = options.latest?.version ?? "not resolved by the CLI";
      const source = options.latest?.source ?? "unknown source";
      return `Upgrade this app's Appstack SDK from ${options.inspection.installedVersion ?? "an unknown version"} to ${latest} (${source}). Confirm the target version from the official registry before editing. Read release notes and migration guidance for every crossed version, update dependencies and lockfiles using the project's package manager, migrate deprecated or breaking calls, and run the narrowest meaningful build or tests. For apps targeting both iOS and Android, trace which distinct key reaches each target. Treat pk_ios_ and pk_android_ as platform identifiers; legacy pk_ keys are valid but have no identifiable platform prefix. Do not change unrelated code.`;
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
    "- customerUserId is optional and only helps the app correlate Appstack's ID with its own user ID or another service. Attribution does not require it. Do not add it or report its absence as a finding unless the app explicitly requires that cross-system ID mapping and the missing mapping is proven from project evidence.",
    "- User attributes can be received from any event. The user_attributes event name shown in SDK examples is not required for matching. Do not flag or request confirmation about a custom event's name or casing, including USER_ATTRIBUTES versus user_attributes, on that basis. Assess parameter keys and values separately.",
    "- A configure() return or resolved promise only acknowledges the call; asynchronous SDK setup can continue afterward. Never use that return as proof of completed initialization, and do not require callers to inspect a boolean or void return. Verify key presence and platform selection instead.",
    "- Stop and explain ambiguity instead of guessing about app startup, build targets, or keys.",
    statusRules,
    "</appstack-cli>",
    "",
    options.skill,
  ]
    .filter((line) => line !== "")
    .join("\n");
}
