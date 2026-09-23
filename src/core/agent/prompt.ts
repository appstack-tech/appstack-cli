import type { Inspection } from "@/core/sdk/inspect";
import type { LatestVersion } from "@/core/sdk/latest";

export type WorkflowId = "integrate" | "review" | "upgrade";

export interface PromptOptions {
  workflow: WorkflowId;
  inspection: Inspection;
  latest?: LatestVersion;
  skill: string;
  apiKeys?: { generic?: boolean; ios?: boolean; android?: boolean; samePlatformKey?: boolean };
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
    `Partner SDKs: ${inspection.partners.length ? inspection.partners.join(", ") : "none detected"}`,
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
  const context = copyMode
    ? `API key values are intentionally omitted from this copied playbook. Make ${variables} available in the destination agent's environment without printing their values.`
    : `API key values are available in the agent environment as ${variables}. Read only the variables needed for configuration and never print their values.`;
  return keys.samePlatformKey
    ? `${context} The supplied iOS and Android keys are identical. Continue with the supplied values and tell the user to replace one; do not invent a key.`
    : context;
}

const SEVERITY = `Severity, used to order findings:
- High: the app fails to build, throws, or crashes, or events, revenue, or attribution are lost or reach the wrong place (for example a deployment target below the SDK minimum, an event before configure, a removed call shape, or missing partner attribution wiring).
- Medium: data quality or configuration problems (wrong-platform or reused keys, non-JSON or non-finite parameters, custom events replacing standard ones, matching fields re-sent on every session, deprecated options, dynamic versions).
- Low: hygiene with no effect on data (for example an iOS-only call that is a no-op on Android).
Order High before Medium before Low. With more than 5 problems, drop the lowest severity first.`;

const REPORT_STYLE =
  "In the final report, do not describe rules you followed, things you intentionally did not do, or checks that found nothing. Use absolute file:line paths for every file reference.";

function implementationReport(workflow: "integrate" | "upgrade"): string {
  return `Final report, in markdown and concise:
- ${workflow === "integrate" ? "Changes: one line per changed file." : "Upgrade: from and to versions, and a one-line summary per crossed version that required a code change. Name crossed versions with no required change on one line."}
- Keys: ${workflow === "integrate" ? "where each supplied key is stored (file or mechanism, never the value), or that it was not stored and exactly how the user must provide it." : "only if a key problem was found."}
- Verified: the commands you ran and their result.
- You need to: remaining manual steps, such as pod install, a native rebuild, or a blocker you did not fix. Omit this section if there are none.`;
}

function task(options: PromptOptions): string {
  switch (options.workflow) {
    case "integrate":
      return `Integrate the Appstack SDK into this app. Make the smallest coherent set of edits. Detect and use the existing package manager and startup architecture. Configure exactly once, keep keys out of committed source using the project's established configuration mechanism, resolve dependencies, and run the narrowest meaningful build or tests. For apps targeting both iOS and Android, route each supplied key to its intended platform. Prefer distinct keys; if the supplied keys are identical, continue and report the correction needed. A pk_ios_ or pk_android_ prefix identifies a platform; legacy pk_ keys are also valid but their text does not identify the platform. Do not add speculative events.

Startup must stay safe: if the key is missing or empty, skip configure with a logged message instead of configuring with an empty string. Where configure can throw (Flutter), catch the failure so the app still starts. For Expo managed or CNG apps, do not run prebuild or commit native directories, and state that a development build is required because Expo Go cannot load the SDK. Keep every file you create or edit, including temporary copies and worktrees, inside the app directory.

${implementationReport("integrate")}
${REPORT_STYLE}

API key context:
${keyContext(options.apiKeys, Boolean(options.copyMode))}`;
    case "review":
      return options.verbose
        ? `Review the existing Appstack integration end to end. Do not modify files. Verify every claim against code or project configuration. In apps targeting both iOS and Android, trace each target's API key configuration and verify that the keys are distinct. A pk_ios_ or pk_android_ prefix identifies a platform; legacy pk_ keys are also valid but their text does not identify the platform. For Expo CNG, inspect app config, config plugins, shared source, and build configuration because native directories may be generated. Report only a proven mismatch and never show key values. Return markdown with: Setup health, Findings ordered by severity, Opportunities, Needs confirmation, and Overall. Tag each finding with a High, Medium, or Low severity as defined below. Include absolute clickable file:line evidence for findings.\n\n${SEVERITY}\n${REPORT_STYLE}`
        : `Review the existing Appstack integration. Do not modify files.

Return a short markdown report only:
- Overall: one sentence.
- Findings: at most 5 verified, actionable problems, ordered by severity. Head each finding with its severity in bold, for example **[High]**, then give one-line Impact, Evidence (absolute clickable file:line), and Change. When a change pins a version, name the exact version.
- Needs confirmation: at most 3 items, each of which would change an Appstack finding if answered. Never ask about dev/prod environment mapping, key rotation, or other vendors' configuration. Omit the section when there are none.

${SEVERITY}

Strict classification rules:
- A finding must be proven from repository evidence and require a concrete change.
- Do not classify absent checked-in API keys as a finding; hosted build systems such as EAS may inject them. Put this under Needs confirmation only when consequential.
- In apps targeting both iOS and Android, trace platform branches and configuration references. Report a proven use of a pk_android_ key for iOS or a pk_ios_ key for Android, including a wrong platform environment variable wired to a target. Never include the full key value.
- Wrong-platform or reused API keys are configuration warnings to fix, but they do not break attribution. Describe the problem as incorrect key assignment, never as rejected events, missing attribution, or broken revenue matching. Do not explain internal key normalization to app developers.
- If iOS and Android environment variable names are cross-wired but their values are unavailable, report the wiring warning while stating that the actual key assignments cannot be verified from the repo.
- Legacy pk_ keys without an ios or android prefix are valid and platform specific, but the value alone cannot identify which platform a distinct key belongs to. The same legacy key is never valid for both platforms. Report proven reuse as a warning without asking whether one key might work for both; do not report a mismatch solely because a legacy key lacks the newer prefix. Put consequential uncertainty about a distinct key's platform assignment under Needs confirmation.
- For Expo CNG, inspect app config, config plugins, shared source, and build configuration; native directories may be absent or generated. Do not infer a missing key or mismatch merely from absent native files.
- configure() may return void or acknowledge the call before asynchronous SDK setup finishes. Do not require checking its return value or treat a resolved call as proof that setup is complete; an unchecked return is never a finding, even where a platform reference shows the check. Check only whether the app supplies a non-empty key for the correct platform and handles an immediate missing-key failure; do not flag subsequent SDK calls or a success log based solely on the return value.
- Missing optional events or consent-dependent matching parameters are opportunities, not findings, unless the app's intended behavior proves they are required.
- Do not fill Needs confirmation with optional event coverage, dev/prod key strategy, key rotation, or other vendors' configuration unless the project shows an Appstack requirement for them.
- When the app uses RevenueCat or Superwall for purchases or paywalls, missing Appstack attribution wiring for that partner is a finding, not a confirmation item.
- Omit healthy checks, exhaustive inventories, low-value observations, and optional improvements from the default report.
- ${REPORT_STYLE}`;
    case "upgrade": {
      const latest = options.latest?.version ?? "not resolved by the CLI";
      const source = options.latest?.source ?? "unknown source";
      return `Upgrade this app's Appstack SDK from ${options.inspection.installedVersion ?? "an unknown version"} to ${latest} (${source}). Confirm the target version from the official registry before editing. Read release notes and migration guidance for every crossed version, update dependencies and lockfiles using the project's package manager, migrate deprecated or breaking calls, and run the narrowest meaningful build or tests. For apps targeting both iOS and Android, check that each target still receives its own key and report only a proven problem. Treat pk_ios_ and pk_android_ as platform identifiers; legacy pk_ keys are valid but have no identifiable platform prefix. Do not change unrelated code or adopt new optional SDK features.

${implementationReport("upgrade")}
${REPORT_STYLE}`;
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
    "- Wrong-platform or reused Appstack keys are warnings to correct, but they do not break attribution. Do not claim they cause rejected events, missing attribution, or lost revenue. Describe only the key assignment warning; keep internal key-normalization details out of user-facing output.",
    "- Legacy pk_ keys have no platform marker but are still issued per platform. If the exact same legacy key is used for iOS and Android, warn about that reuse; do not ask whether one legacy key might be valid for both.",
    "- customerUserId is optional and only helps the app correlate Appstack's ID with its own user ID or another service. Attribution does not require it. Do not add it or report its absence as a finding unless the app explicitly requires that cross-system ID mapping and the missing mapping is proven from project evidence.",
    "- User attributes can be received from any event. The user_attributes event name shown in SDK examples is not required for matching. Do not flag or request confirmation about a custom event's name or casing, including USER_ATTRIBUTES versus user_attributes, on that basis. Assess parameter keys and values separately.",
    "- A configure() return or resolved promise only acknowledges the call; asynchronous SDK setup can continue afterward. Never use that return as proof of completed initialization, and do not require callers to inspect a boolean or void return. Verify key presence and platform selection instead.",
    "- The key-assignment rules above apply to apps that target both iOS and Android. For a single-platform app, do not add key-assignment warnings or sections.",
    "- Stop and explain ambiguity instead of guessing about app startup, build targets, or keys.",
    statusRules,
    "</appstack-cli>",
    "",
    options.skill,
  ]
    .filter((line) => line !== "")
    .join("\n");
}
