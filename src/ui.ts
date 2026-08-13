import pc from "picocolors";

export function intro(message: string): void {
  process.stdout.write(`${pc.bold(message)}\n`);
}

export function info(message: string): void {
  process.stdout.write(`${pc.cyan("•")} ${message}\n`);
}

export function success(message: string): void {
  process.stdout.write(`${pc.green("✓")} ${message}\n`);
}

export function warning(message: string): void {
  process.stdout.write(`${pc.yellow("!")} ${message}\n`);
}

export function failure(message: string): void {
  process.stderr.write(`${pc.red("✗")} ${message}\n`);
}

export function report(message: string): void {
  process.stdout.write(`${message.trimEnd()}\n`);
}

export function status(message: string): void {
  process.stdout.write(`${pc.dim("│")} ${message}\n`);
}
