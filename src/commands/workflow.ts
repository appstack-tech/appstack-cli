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

function printInspection(inspection: Inspection): void {
  ui.info(
    `${inspection.project.frameworkLabel} · ${inspection.project.relativePath} · SDK ${inspection.installedVersion ?? "not detected"}`,
  );
  if (!inspection.findings.length) {
    ui.success("No deterministic integration problems found.");
    return;
  }
  for (const finding of inspection.findings) {
    ui.finding(
      finding.severity,
      `${finding.message}${finding.files?.length ? ` ${pc.dim(`(${finding.files.join(", ")})`)}` : ""}`,
    );
  }
}

async function upgradeTarget(args: WorkflowArgs): Promise<LatestVersion | undefined> {
  if (args.command !== "upgrade") return undefined;
  if (args.to && args.to !== "latest") {
    if (!isValidVersion(args.to)) {
      throw new Error(`Invalid SDK version "${args.to}". Pass a semantic version such as 2.6.0.`);
    }
    return { version: args.to, source: "--to" };
  }
  return resolveLatestVersion(args.framework!);
}

export async function runWorkflow(args: WorkflowArgs): Promise<void> {
  const root = resolve(args.installDir ?? process.cwd());
  const project = await resolveProject(root, args.framework);
  args.framework = project.framework;
  const inspection = inspectProject(project);
  const latest = await upgradeTarget(args);

  const keyValues = {
    generic: args.apiKey ?? process.env.APPSTACK_API_KEY,
    ios: args.iosApiKey ?? process.env.APPSTACK_IOS_API_KEY,
    android: args.androidApiKey ?? process.env.APPSTACK_ANDROID_API_KEY,
  };

  if (args.json) {
    writeJson({ inspection, ...(latest ? { latest } : {}) });
    return;
  }

  const resolvedSkill = await resolveSkill({
    framework: project.framework,
    refresh: !args.dryRun,
  });

  const prompt = buildPrompt({
    workflow: args.command,
    inspection,
    latest,
    skill: resolvedSkill.body,
    apiKeys: {
      generic: Boolean(keyValues.generic),
      ios: Boolean(keyValues.ios),
      android: Boolean(keyValues.android),
    },
    copyMode: args.skill,
    verbose: args.verbose,
  });

  if (args.skill) {
    process.stdout.write(`${prompt}\n`);
    return;
  }

  ui.intro(`Appstack ${args.command}`);
  printInspection(inspection);

  if (args.command === "upgrade") {
    if (!inspection.installedVersion) {
      throw new Error("No installed Appstack SDK version was detected. Run `appstack integrate` instead.");
    }
    if (!latest?.version) {
      throw new Error(
        `Could not resolve the latest version from ${latest?.source ?? "the registry"}: ${latest?.error ?? "unknown error"}. Pass --to <version> to continue explicitly.`,
      );
    }
    if (compareVersions(inspection.installedVersion, latest.version) >= 0) {
      ui.success(`Already on Appstack SDK ${inspection.installedVersion}.`);
      ui.outro("Nothing to upgrade");
      return;
    }
    ui.info(`Upgrade target ${latest.version} · ${latest.source}`);
  }

  if (args.dryRun) {
    ui.info("Dry run: no agent started and no files changed.");
    ui.outro("Inspection complete");
    return;
  }

  const driver = await resolveDriver(args.driver);
  if (!driver) {
    if (args.command === "review") {
      ui.warning("No Claude Code or Codex installation found; showing deterministic review only.");
      ui.outro("Review complete");
      return;
    }
    throw new Error(
      "No coding agent found. Install Claude Code or Codex, or run this command with --skill and paste the playbook into your agent.",
    );
  }

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
          ? { filesystem: "read", network: true, shell: "read-only" }
          : { filesystem: "write", network: true, shell: "unrestricted" },
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
  if (!result.ok) throw new Error(`${driver.displayName} stopped before finishing.`);

  if (result.finalText) ui.report(result.finalText);
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
      printInspection(after);
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
