import { resolve } from "node:path";
import pc from "picocolors";
import type { FrameworkId } from "@/constants";
import { resolveDriver, type DriverId } from "@/core/agent";
import { buildPrompt, type WorkflowId } from "@/core/agent/prompt";
import { resolveProject } from "@/core/project/scan";
import { inspectProject, type Inspection } from "@/core/sdk/inspect";
import {
  compareVersions,
  resolveLatestVersion,
  type LatestVersion,
} from "@/core/sdk/latest";
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
}

function findingIcon(severity: string): string {
  if (severity === "error") return pc.red("✗");
  if (severity === "warning") return pc.yellow("!");
  return pc.cyan("•");
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
    process.stdout.write(
      `${findingIcon(finding.severity)} ${finding.message}${finding.files?.length ? ` ${pc.dim(`(${finding.files.join(", ")})`)}` : ""}\n`,
    );
  }
}

async function upgradeTarget(args: WorkflowArgs): Promise<LatestVersion | undefined> {
  if (args.command !== "upgrade") return undefined;
  if (args.to && args.to !== "latest") {
    return { version: args.to, source: "--to" };
  }
  return resolveLatestVersion(args.framework!);
}

function jsonOutput(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function runWorkflow(args: WorkflowArgs): Promise<void> {
  const root = resolve(args.installDir ?? process.cwd());
  const project = await resolveProject(root, args.framework);
  args.framework = project.framework;
  const inspection = inspectProject(project);
  const latest = await upgradeTarget(args);

  if (args.json) {
    jsonOutput({ inspection, ...(latest ? { latest } : {}) });
    return;
  }

  const prompt = buildPrompt({
    workflow: args.command,
    inspection,
    latest,
    apiKeys: {
      generic: args.apiKey ?? process.env.APPSTACK_API_KEY,
      ios: args.iosApiKey ?? process.env.APPSTACK_IOS_API_KEY,
      android: args.androidApiKey ?? process.env.APPSTACK_ANDROID_API_KEY,
    },
    copyMode: args.skill,
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
      return;
    }
    ui.info(`Upgrade target ${latest.version} · ${latest.source}`);
  }

  if (args.dryRun) {
    ui.info("Dry run: no agent started and no files changed.");
    return;
  }

  const driver = await resolveDriver(args.driver);
  if (!driver) {
    if (args.command === "review") {
      ui.warning("No Claude Code or Codex installation found; showing deterministic review only.");
      return;
    }
    throw new Error(
      "No coding agent found. Install Claude Code or Codex, or run this command with --skill and paste the playbook into your agent.",
    );
  }

  ui.info(`Running ${driver.displayName} in ${args.command === "review" ? "read-only" : "read-write"} mode.`);
  const result = await driver.run({
    prompt,
    cwd: project.path,
    capabilities:
      args.command === "review"
        ? { filesystem: "read", network: true, shell: "read-only" }
        : { filesystem: "write", network: true, shell: "unrestricted" },
    onStatus: ui.status,
  });
  if (!result.ok) throw new Error(`${driver.displayName} stopped before finishing.`);

  if (result.finalText) ui.report(result.finalText);
  if (args.command !== "review") {
    const after = inspectProject(project);
    if (after.findings.length) {
      ui.warning("The workflow finished with remaining deterministic findings:");
      printInspection(after);
    } else {
      ui.success("The Appstack integration passes deterministic checks.");
    }
  }
}
