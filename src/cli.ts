import { resolve } from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import pc from "picocolors";
import { FRAMEWORK_LABEL, VERSION, type FrameworkId } from "@/constants";
import { runWorkflow } from "@/commands/workflow";
import * as ui from "@/ui";

const FRAMEWORKS = Object.keys(FRAMEWORK_LABEL) as FrameworkId[];

function workflowOptions(y: ReturnType<typeof yargs>) {
  return y.options({
    "install-dir": {
      type: "string",
      describe: "App directory to inspect (default: current directory)",
    },
    framework: {
      type: "string",
      choices: FRAMEWORKS,
      describe: "Select a framework when more than one app is detected",
    },
    driver: {
      type: "string",
      choices: ["claude", "codex"] as const,
      describe: "Force a coding-agent backend",
    },
    skill: {
      type: "boolean",
      describe: "Print the composed playbook instead of running an agent",
    },
    "dry-run": {
      type: "boolean",
      describe: "Inspect and show the plan without changing files",
    },
    json: {
      type: "boolean",
      describe: "Print the deterministic inspection as JSON",
    },
  });
}

function printHelp(): void {
  const row = (command: string, description: string) =>
    `  ${command.padEnd(24)}${description}`;
  process.stdout.write(
    [
      `${pc.bold("Appstack CLI")} ${pc.dim(`v${VERSION}`)}`,
      "",
      "Automate the Appstack SDK lifecycle with your coding agent.",
      "",
      pc.bold("Usage:"),
      "  appstack <command>",
      "",
      pc.bold("Workflow commands:"),
      row("integrate", "Install and configure the SDK"),
      row("review", "Audit an existing integration (read-only)"),
      row("upgrade", "Upgrade the SDK and migrate changed APIs"),
      "",
      pc.bold("Flags:"),
      row("--skill", "Print the agent playbook"),
      row("--dry-run", "Inspect without changing files"),
      row("--json", "Machine-readable deterministic inspection"),
      row("--framework <name>", "Select one app in a multi-app repository"),
      row("--install-dir <path>", "Inspect a directory other than cwd"),
      "",
      `Run ${pc.bold("appstack <command> --help")} for command-specific options.`,
      "",
    ].join("\n"),
  );
}

export async function run(): Promise<void> {
  const args = hideBin(process.argv);
  if (!args.length || args[0] === "help" || (args.length === 1 && ["-h", "--help"].includes(args[0]!))) {
    printHelp();
    return;
  }

  const cli = yargs(args)
    .scriptName("appstack")
    .command(
      "integrate",
      "Install and configure the Appstack SDK",
      (y) =>
        workflowOptions(y).options({
          "api-key": { type: "string", describe: "API key for a single-platform app" },
          "ios-api-key": { type: "string", describe: "iOS API key for a cross-platform app" },
          "android-api-key": { type: "string", describe: "Android API key for a cross-platform app" },
        }),
      (argv) =>
        runWorkflow({
          command: "integrate",
          installDir: argv.installDir,
          framework: argv.framework as FrameworkId | undefined,
          driver: argv.driver,
          skill: argv.skill,
          dryRun: argv.dryRun,
          json: argv.json,
          apiKey: argv.apiKey,
          iosApiKey: argv.iosApiKey,
          androidApiKey: argv.androidApiKey,
        }),
    )
    .command(
      "review",
      "Audit an Appstack SDK integration without modifying files",
      workflowOptions,
      (argv) =>
        runWorkflow({
          command: "review",
          installDir: argv.installDir,
          framework: argv.framework as FrameworkId | undefined,
          driver: argv.driver,
          skill: argv.skill,
          dryRun: argv.dryRun,
          json: argv.json,
        }),
    )
    .command(
      "upgrade",
      "Upgrade the Appstack SDK and migrate changed APIs",
      (y) =>
        workflowOptions(y).option("to", {
          type: "string",
          default: "latest",
          describe: "Target SDK version (default: latest stable)",
        }),
      (argv) =>
        runWorkflow({
          command: "upgrade",
          installDir: argv.installDir,
          framework: argv.framework as FrameworkId | undefined,
          driver: argv.driver,
          skill: argv.skill,
          dryRun: argv.dryRun,
          json: argv.json,
          to: argv.to,
        }),
    )
    .version(VERSION)
    .alias("v", "version")
    .help()
    .alias("h", "help")
    .strict()
    .recommendCommands()
    .showHelpOnFail(false)
    .fail((message, error) => {
      throw error ?? new Error(message);
    });

  try {
    await cli.parseAsync();
  } catch (error) {
    ui.failure(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
