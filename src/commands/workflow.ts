import { resolve } from "node:path";
import pc from "picocolors";
import type { FrameworkId } from "@/constants";
import { resolveDriver, type DriverId } from "@/core/agent";
import { buildPrompt, type WorkflowId } from "@/core/agent/prompt";
import { resolveProject } from "@/core/project/scan";
import { inspectProject, type Inspection } from "@/core/sdk/inspect";
import {
  compareVersions,
  isValidVersion,
  resolveLatestVersion,
  type LatestVersion,
} from "@/core/sdk/latest";
import { verifyWorkflowPostconditions } from "@/core/sdk/postconditions";
import { resolveSkill } from "@/core/skill/resolve";
import type { TaskReference } from "@/core/skill/types";
import { writeJson } from "@/output";
import * as ui from "@/ui";

export interface WorkflowArgs {
  command: WorkflowId;
  installDir?: string;
  framework?: FrameworkId;
  driver?: DriverId;
  skill?: boolean;
  dryRun?: boolean;
  json?: boolean;
  apiKey?: string;
  iosApiKey?: string;
  androidApiKey?: string;
  to?: string;
  verbose?: boolean;
}

// The shared SKILL.md routes each task to framework-neutral references. Load
// only the ones this workflow needs.
export function taskReferences(command: WorkflowId, inspection: Inspection): TaskReference[] {
  const partner: TaskReference[] = inspection.partners.length ? ["partner-integrations"] : [];
  switch (command) {
    case "review":
      return ["review-troubleshooting", "event-design", ...partner];
    case "integrate":
      return partner;
    case "upgrade":
      return [];
  }
}

export function stripStatusLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*\[STATUS\]/.test(line))
    .join("\n")
    .trim();
}

// Before integration, a missing dependency and initialization are the
// expected starting state, not errors.
const INTEGRATE_START = new Set(["sdk-not-installed", "configure-missing"]);

function printInspection(inspection: Inspection, command?: WorkflowId): void {
  ui.info(
    `${inspection.project.frameworkLabel} · ${inspection.project.relativePath} · SDK ${inspection.installedVersion ?? "not detected"}`,
  );
  if (!inspection.findings.length) {
    ui.success("No deterministic integration problems found.");
    return;
  }
  if (
    command === "integrate" &&
    inspection.findings.every((finding) => INTEGRATE_START.has(finding.code))
  ) {
    ui.info("Appstack is not integrated yet.");
    return;
  }
  for (const finding of inspection.findings) {
    ui.finding(
      command === "integrate" && INTEGRATE_START.has(finding.code) ? "info" : finding.severity,
      `${finding.message}${finding.files?.length ? ` ${pc.dim(`(${finding.files.join(", ")})`)}` : ""}`,
    );
  }
}

function printPlan(
  command: WorkflowId,
  inspection: Inspection,
  keys: { generic?: string; ios?: string; android?: string },
): void {
  const names = [
    keys.generic ? "APPSTACK_API_KEY" : undefined,
    keys.ios ? "APPSTACK_IOS_API_KEY" : undefined,
    keys.android ? "APPSTACK_ANDROID_API_KEY" : undefined,
  ].filter(Boolean);
  const steps: Record<WorkflowId, string> = {
    integrate: "An agent would install the latest SDK, configure it once at startup, and store the keys with the project's config mechanism.",
    review: "An agent would audit the integration read-only and report up to 5 findings by severity.",
    upgrade: "An agent would update the dependency and lockfile, migrate changed calls, and run a build.",
  };
  ui.info(`Plan: ${steps[command]}`);
  if (command === "integrate") {
    ui.info(
      names.length
        ? `Keys supplied: ${names.join(", ")} (values are never printed).`
        : "No API key supplied. Set APPSTACK_API_KEY, or APPSTACK_IOS_API_KEY and APPSTACK_ANDROID_API_KEY, or the agent will look for an existing project config value.",
    );
  }
  if (inspection.partners.length) {
    ui.info(`Partner SDKs detected: ${inspection.partners.join(", ")}.`);
  }
}

async function upgradeTarget(
  args: WorkflowArgs,
  framework: FrameworkId,
): Promise<LatestVersion | undefined> {
  if (args.command !== "upgrade") return undefined;
  if (args.to && args.to !== "latest") {
    if (!isValidVersion(args.to)) {
      throw new Error(`Invalid SDK version "${args.to}". Pass a semantic version such as 2.6.0.`);
    }
    return { version: args.to, source: "--to" };
  }
  return resolveLatestVersion(framework);
}

export async function runWorkflow(args: WorkflowArgs): Promise<void> {
  const root = resolve(args.installDir ?? process.cwd());
  const project = await resolveProject(root, args.framework);
  const inspection = inspectProject(project);

  if (args.json) {
    writeJson({ inspection });
    return;
  }

  const latest = await upgradeTarget(args, project.framework);

  const keyValues = {
    generic: args.apiKey ?? process.env.APPSTACK_API_KEY,
    ios: args.iosApiKey ?? process.env.APPSTACK_IOS_API_KEY,
    android: args.androidApiKey ?? process.env.APPSTACK_ANDROID_API_KEY,
  };
  const samePlatformKey = Boolean(
    args.command === "integrate" &&
    keyValues.ios &&
    keyValues.android &&
    keyValues.ios === keyValues.android
  );

  if (!args.skill) {
    ui.intro(`Appstack ${args.command}`);
    printInspection(inspection, args.command);
    if (samePlatformKey) {
      ui.warning("The supplied iOS and Android API keys are identical. Use a different key for each platform when available.");
    }
  }

  if (args.command === "upgrade") {
    if (!inspection.installedVersion) {
      throw new Error(
        inspection.installed
          ? "The Appstack SDK is installed, but its version could not be read from the project. Pass --to <version> to upgrade explicitly."
          : "No installed Appstack SDK was detected. Run `appstack integrate` instead.",
      );
    }
    if (!latest?.version) {
      throw new Error(
        `Could not resolve the latest version from ${latest?.source ?? "the registry"}: ${latest?.error ?? "unknown error"}. Pass --to <version> to continue explicitly.`,
      );
    }
    if (compareVersions(inspection.installedVersion, latest.version) >= 0 && !args.skill) {
      ui.success(`Already on Appstack SDK ${inspection.installedVersion}.`);
      ui.outro("Nothing to upgrade");
      return;
    }
    if (!args.skill) ui.info(`Upgrade target ${latest.version} · ${latest.source}`);
  }

  const buildWorkflowPrompt = async (): Promise<string> => {
    // Review and integrate recommend or install an exact version; resolve it
    // here so agents without web access still name the current release.
    const promptLatest = latest ?? (await resolveLatestVersion(project.framework));
    const resolvedSkill = await resolveSkill({
      framework: project.framework,
      references: taskReferences(args.command, inspection),
      refresh: !args.dryRun,
    });
    return buildPrompt({
      workflow: args.command,
      inspection,
      latest: promptLatest,
      skill: resolvedSkill.body,
      apiKeys: {
        generic: Boolean(keyValues.generic),
        ios: Boolean(keyValues.ios),
        android: Boolean(keyValues.android),
        samePlatformKey,
      },
      copyMode: args.skill,
      verbose: args.verbose,
    });
  };

  if (args.skill) {
    const prompt = await buildWorkflowPrompt();
    process.stdout.write(`${prompt}\n`);
    return;
  }

  if (args.dryRun) {
    printPlan(args.command, inspection, keyValues);
    ui.info("Dry run: no agent started and no files changed.");
    ui.outro("Inspection complete");
    return;
  }

  const driver = await resolveDriver(args.driver);
  if (!driver) {
    if (args.command === "review") {
      ui.warning("No supported coding agent found; showing deterministic review only.");
      ui.outro("Review complete");
      return;
    }
    throw new Error(
      "No supported coding agent found. Install one or run this command with --skill and paste the playbook into your agent.",
    );
  }
  const prompt = await buildWorkflowPrompt();

  ui.status(
    `Running ${driver.displayName} in ${args.command === "review" ? "read-only" : "read-write"} mode`,
  );
  let result;
  try {
    result = await driver.run({
      prompt,
      cwd: project.path,
      env: {
        ...process.env,
        ...(keyValues.generic ? { APPSTACK_API_KEY: keyValues.generic } : {}),
        ...(keyValues.ios ? { APPSTACK_IOS_API_KEY: keyValues.ios } : {}),
        ...(keyValues.android ? { APPSTACK_ANDROID_API_KEY: keyValues.android } : {}),
      },
      capabilities:
        args.command === "review"
          ? { filesystem: "read", network: true }
          : { filesystem: "write", network: true },
      onStatus: ui.status,
    });
  } catch (error) {
    ui.stopStatus(`${driver.displayName} stopped`, false);
    throw error;
  }
  ui.stopStatus(
    result.ok ? `${driver.displayName} completed` : `${driver.displayName} stopped`,
    result.ok,
  );
  if (!result.ok) {
    throw new Error(
      `${driver.displayName} stopped before finishing.${result.error ? `\n${result.error}` : ""}`,
    );
  }

  const report = result.finalText ? stripStatusLines(result.finalText) : "";
  if (report) ui.report(report);
  if (args.command !== "review") {
    const after = inspectProject(project);
    const verification = verifyWorkflowPostconditions({
      workflow: args.command,
      after,
      targetVersion: latest?.version,
    });
    if (!verification.ok) {
      throw new Error(
        `${driver.displayName} exited successfully, but ${args.command} verification failed: ${verification.errors.join(" ")}`,
      );
    }
    if (after.findings.length) {
      ui.warning("The workflow finished with remaining deterministic findings:");
      printInspection(after, args.command);
    } else {
      ui.success(
        args.command === "upgrade"
          ? `Verified Appstack SDK ${after.installedVersion}.`
          : "Verified the Appstack SDK dependency and initialization.",
      );
    }
  }
  ui.outro(`${args.command === "review" ? "Review" : "Workflow"} complete`);
}
