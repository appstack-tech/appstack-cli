export interface CliError {
  error: {
    code: "invalid_arguments" | "command_error";
    message: string;
  };
}

export function wantsJson(args: string[]): boolean {
  let enabled = false;
  for (const arg of args) {
    if (arg === "--json" || arg === "--json=true") enabled = true;
    if (arg === "--no-json" || arg === "--json=false") enabled = false;
  }
  return enabled;
}

export function errorOutput(error: unknown): CliError {
  const message = error instanceof Error ? error.message : String(error);
  const invalidArguments = /^(?:Unknown argument|Unknown command|Invalid values?:|Not enough non-option arguments)/i.test(
    message,
  );
  return {
    error: {
      code: invalidArguments ? "invalid_arguments" : "command_error",
      message,
    },
  };
}

export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
