import * as p from "@clack/prompts";
import { resolve } from "node:path";
import pc from "picocolors";
import type { WorkflowArgs } from "@/commands/workflow";
import { VERSION, type FrameworkId } from "@/constants";
import { scanProjects, type DetectedProject } from "@/core/project/scan";
import type { WorkflowId } from "@/core/agent/prompt";
import { configurePromptTheme, theme } from "@/theme";

configurePromptTheme();

type RunMode = "run" | "dry-run" | "skill";

function cancelled(value: unknown): value is symbol {
  if (!p.isCancel(value)) return false;
  p.cancel("No changes were made.");
  return true;
}

async function chooseProject(root: string): Promise<DetectedProject | undefined> {
  const spinner = p.spinner();
  spinner.start("Detecting mobile apps");
  const projects = await scanProjects(root);
  if (!projects.length) {
    spinner.stop("No supported mobile app found", 1);
    p.cancel(`Run Appstack from a Swift, Kotlin, React Native, Flutter, or Unity project.`);
    return undefined;
  }
  spinner.stop(
    projects.length === 1
      ? `Found ${projects[0]!.frameworkLabel}`
      : `Found ${projects.length} mobile apps`,
  );
  if (projects.length === 1) return projects[0];

  const selected = await p.select({
    message: "Which app do you want to work on?",
    options: projects.map((project, index) => ({
      value: index,
      label: project.name,
      hint: `${project.frameworkLabel} · ${project.relativePath}`,
    })),
  });
  if (cancelled(selected)) return undefined;
  return projects[selected];
}

async function chooseWorkflow(): Promise<WorkflowId | undefined> {
  const workflow = await p.select<WorkflowId>({
    message: "What would you like to do?",
    options: [
      {
        value: "integrate",
        label: "Integrate the SDK",
        hint: "install and configure",
      },
      {
        value: "review",
        label: "Review the integration",
        hint: "read-only audit",
      },
      {
        value: "upgrade",
        label: "Upgrade the SDK",
        hint: "update and migrate",
      },
    ],
  });
  return cancelled(workflow) ? undefined : workflow;
}

async function chooseMode(): Promise<RunMode | undefined> {
  const mode = await p.select<RunMode>({
    message: "How should Appstack proceed?",
    options: [
      { value: "run", label: "Run the workflow", hint: "start a coding agent" },
      { value: "dry-run", label: "Inspect only", hint: "do not change files" },
      { value: "skill", label: "Print the playbook", hint: "run it yourself" },
    ],
  });
  return cancelled(mode) ? undefined : mode;
}

async function readSecret(message: string): Promise<string | undefined> {
  const value = await p.password({
    message,
    mask: "•",
    validate: (input) => (input.trim() ? undefined : "Enter a key or press Ctrl+C to cancel."),
  });
  return cancelled(value) ? undefined : value.trim();
}

async function addIntegrationKeys(
  args: WorkflowArgs,
  framework: FrameworkId,
): Promise<boolean> {
  const hasEnvironmentKeys = Boolean(
    process.env.APPSTACK_API_KEY ||
      (process.env.APPSTACK_IOS_API_KEY && process.env.APPSTACK_ANDROID_API_KEY),
  );
  const provideKeys = await p.confirm({
    message: hasEnvironmentKeys
      ? "Override the API keys already set in the environment?"
      : "Provide API keys now?",
    initialValue: false,
  });
  if (cancelled(provideKeys)) return false;
  if (!provideKeys) return true;

  if (framework === "react-native" || framework === "flutter") {
    const ios = await readSecret("iOS API key");
    if (!ios) return false;
    const android = await readSecret("Android API key");
    if (!android) return false;
    args.iosApiKey = ios;
    args.androidApiKey = android;
  } else {
    const key = await readSecret("Appstack API key");
    if (!key) return false;
    args.apiKey = key;
  }
  return true;
}

async function addUpgradeTarget(args: WorkflowArgs): Promise<boolean> {
  const target = await p.text({
    message: "Target SDK version",
    placeholder: "latest",
    defaultValue: "latest",
    validate: (value) => (value.trim() ? undefined : "Enter a version or use latest."),
  });
  if (cancelled(target)) return false;
  args.to = target.trim();
  return true;
}

export function canLaunchTui(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && process.env.TERM !== "dumb");
}

export async function promptForWorkflow(
  installDir = process.cwd(),
): Promise<WorkflowArgs | undefined> {
  const root = resolve(installDir);
  p.intro(`${theme.wordmark(" Appstack ")} ${pc.dim(`v${VERSION}`)}`);

  const project = await chooseProject(root);
  if (!project) return undefined;
  const command = await chooseWorkflow();
  if (!command) return undefined;
  const mode = await chooseMode();
  if (!mode) return undefined;

  const args: WorkflowArgs = {
    command,
    installDir: project.path,
    framework: project.framework,
    dryRun: mode === "dry-run",
    skill: mode === "skill",
  };

  if (
    command === "integrate" &&
    mode === "run" &&
    !(await addIntegrationKeys(args, project.framework))
  ) {
    return undefined;
  }
  if (command === "upgrade" && !(await addUpgradeTarget(args))) return undefined;

  if (mode === "run" && command !== "review") {
    const confirmed = await p.confirm({
      message: `${command === "integrate" ? "Integrate" : "Upgrade"} ${project.name}?`,
      active: "Yes",
      inactive: "No",
      initialValue: true,
    });
    if (cancelled(confirmed)) return undefined;
    if (!confirmed) {
      p.cancel("No changes were made.");
      return undefined;
    }
  }

  p.outro(
    mode === "skill"
      ? "Playbook ready"
      : mode === "dry-run"
        ? "Starting inspection"
        : "Starting workflow",
  );
  return args;
}
