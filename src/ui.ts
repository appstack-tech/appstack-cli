import * as p from "@clack/prompts";
import pc from "picocolors";
import { renderTerminalMarkdown, reportWidth } from "@/markdown";
import { configurePromptTheme, theme } from "@/theme";

configurePromptTheme();

const interactive = Boolean(
  process.stdout.isTTY && process.stderr.isTTY && process.env.TERM !== "dumb",
);

let activeSpinner: ReturnType<typeof p.spinner> | undefined;

function stopActiveSpinner(message?: string, code = 0): void {
  if (!activeSpinner) return;
  activeSpinner.stop(message, code);
  activeSpinner = undefined;
}

export function intro(message: string): void {
  if (interactive) p.intro(pc.bold(message));
  else process.stdout.write(`${pc.bold(message)}\n`);
}

export function info(message: string): void {
  if (interactive) p.log.info(message);
  else process.stdout.write(`${pc.cyan("•")} ${message}\n`);
}

export function success(message: string): void {
  stopActiveSpinner();
  if (interactive) p.log.message(message, { symbol: theme.success("◆") });
  else process.stdout.write(`${theme.success("✓")} ${message}\n`);
}

export function warning(message: string): void {
  stopActiveSpinner();
  if (interactive) p.log.warn(message);
  else process.stdout.write(`${pc.yellow("!")} ${message}\n`);
}

export function finding(
  severity: "error" | "warning" | "info",
  message: string,
): void {
  if (interactive) {
    if (severity === "error") p.log.error(message);
    else if (severity === "warning") p.log.warn(message);
    else p.log.info(message);
    return;
  }
  const icon =
    severity === "error"
      ? pc.red("✗")
      : severity === "warning"
        ? pc.yellow("!")
        : theme.primary("•");
  process.stdout.write(`${icon} ${message}\n`);
}

export function failure(message: string): void {
  stopActiveSpinner(undefined, 1);
  if (interactive) p.cancel(message);
  else process.stderr.write(`${pc.red("✗")} ${message}\n`);
}

export function report(message: string): void {
  stopActiveSpinner();
  if (!interactive) {
    process.stdout.write(`${message.trimEnd()}\n`);
    return;
  }
  p.log.message("Agent report", { symbol: theme.primary("◆") });
  for (const line of renderTerminalMarkdown(message, reportWidth())) {
    process.stdout.write(`${pc.dim("│")}${line ? `  ${line}` : ""}\n`);
  }
}

export function status(message: string): void {
  if (interactive) {
    if (!activeSpinner) {
      activeSpinner = p.spinner();
      activeSpinner.start(message);
    } else {
      activeSpinner.message(message);
    }
  } else {
    process.stdout.write(`${pc.dim("│")} ${message}\n`);
  }
}

export function stopStatus(message: string, ok = true): void {
  if (interactive) {
    stopActiveSpinner(message, ok ? 0 : 1);
  } else if (ok) {
    success(message);
  } else {
    warning(message);
  }
}

export function outro(message = "Done"): void {
  if (interactive) p.outro(message);
}
