import pc from "picocolors";

type Formatter = (value: string | number | null | undefined) => string;

interface TerminalColor {
  rgb: readonly [number, number, number];
  ansi256: number;
  fallback: Formatter;
}

export const APPSTACK_COLORS = {
  ink: "#0D0D0D",
  paper: "#FAFAFA",
  muted: "#8A8A8A",
  success: "#3DB15E",
} as const;

function colorDepth(): number {
  if (!pc.isColorSupported) return 1;
  if (typeof process.stdout.getColorDepth === "function") {
    return process.stdout.getColorDepth();
  }
  if (/truecolor|24bit/i.test(process.env.COLORTERM ?? "")) return 24;
  if (/256color/i.test(process.env.TERM ?? "")) return 8;
  return 4;
}

function terminalColor(color: TerminalColor, background = false): Formatter {
  return (value) => {
    const text = String(value ?? "");
    const depth = colorDepth();
    if (depth < 4) return text;
    if (depth >= 24) {
      const [red, green, blue] = color.rgb;
      return `\u001B[${background ? 48 : 38};2;${red};${green};${blue}m${text}\u001B[${background ? 49 : 39}m`;
    }
    if (depth >= 8) {
      return `\u001B[${background ? 48 : 38};5;${color.ansi256}m${text}\u001B[${background ? 49 : 39}m`;
    }
    return background ? pc.bgYellow(text) : color.fallback(text);
  };
}

const successColor: TerminalColor = {
  rgb: [61, 177, 94],
  ansi256: 71,
  fallback: pc.green,
};

export const theme = {
  primary: pc.bold,
  wordmark: (value: string) => pc.inverse(pc.bold(value)),
  success: terminalColor(successColor),
} as const;

let configured = false;

/**
 * Clack uses picocolors internally and does not expose color tokens. Replacing
 * its chromatic prompt formatters with bold/inverse text keeps the prompt
 * behavior while applying Appstack's monochrome identity.
 */
export function configurePromptTheme(): void {
  if (configured) return;
  configured = true;
  const colors = pc as unknown as Record<string, Formatter>;
  colors.cyan = theme.primary;
  colors.blue = theme.primary;
  colors.magenta = theme.primary;
  colors.green = theme.primary;
  colors.bgCyan = pc.inverse;
}
