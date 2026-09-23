import { homedir } from "node:os";
import pc from "picocolors";

type Style = (value: string) => string;

export interface BannerRow {
  label: string;
  value: string;
  tone?: "default" | "muted" | "error";
  /** Which end to cut when the value does not fit; paths keep their tail. */
  truncate?: "end" | "start";
}

export interface BannerOptions {
  version: string;
  rows: BannerRow[];
  tip?: string;
  columns?: number;
  style?: Partial<BannerStyle>;
}

export interface BannerStyle {
  block: Style;
  shadow: Style;
  muted: Style;
  strong: Style;
  error: Style;
  wordmark: Style;
}

const DEFAULT_STYLE: BannerStyle = {
  block: pc.bold,
  shadow: pc.dim,
  muted: pc.dim,
  strong: pc.bold,
  error: pc.red,
  wordmark: (value) => pc.inverse(pc.bold(value)),
};

// ANSI Shadow glyphs. Solid blocks carry the letterform; box-drawing
// characters form the drop shadow and are rendered dim.
const GLYPHS: Record<string, readonly string[]> = {
  A: [" █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
  P: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔═══╝ ", "██║     ", "╚═╝     "],
  S: ["███████╗", "██╔════╝", "███████╗", "╚════██║", "███████║", "╚══════╝"],
  T: ["████████╗", "╚══██╔══╝", "   ██║   ", "   ██║   ", "   ██║   ", "   ╚═╝   "],
  C: [" ██████╗", "██╔════╝", "██║     ", "██║     ", "╚██████╗", " ╚═════╝"],
  K: ["██╗  ██╗", "██║ ██╔╝", "█████╔╝ ", "██╔═██╗ ", "██║  ██╗", "╚═╝  ╚═╝"],
};

const WORD = "APPSTACK";
const INDENT = "  ";

// eslint-disable-next-line no-control-regex
const ANSI = /\u001B\[[0-9;]*m|\u001B\]8;;[^\u0007]*\u0007/g;

export function visibleWidth(value: string): number {
  return [...value.replace(ANSI, "")].length;
}

function wordmarkLines(style: BannerStyle): string[] {
  const rows = GLYPHS.A!.length;
  return Array.from({ length: rows }, (_, row) => {
    const raw = [...WORD].map((letter) => GLYPHS[letter]![row]).join("");
    return raw.replace(/█+|[^█]+/g, (run) =>
      run.startsWith("█") ? style.block(run) : style.shadow(run),
    );
  });
}

export const WORDMARK_WIDTH = [...WORD].reduce(
  (width, letter) => width + GLYPHS[letter]![0]!.length,
  0,
);

/** Abbreviates the home directory as `~`. */
export function displayPath(path: string, home = homedir()): string {
  return home && (path === home || path.startsWith(`${home}/`))
    ? `~${path.slice(home.length)}`
    : path;
}

function truncate(value: string, max: number, from: BannerRow["truncate"] = "end"): string {
  const chars = [...value];
  if (chars.length <= max) return value;
  if (max <= 1) return "…";
  return from === "start"
    ? `…${chars.slice(chars.length - max + 1).join("")}`
    : `${chars.slice(0, max - 1).join("")}…`;
}

function card(rows: BannerRow[], columns: number, style: BannerStyle): string[] {
  const labelWidth = Math.max(...rows.map((row) => row.label.length)) + 2;
  const naturalWidth = Math.max(...rows.map((row) => labelWidth + [...row.value].length));
  // Border plus one space of padding on each side.
  const maxInner = Math.max(labelWidth + 8, columns - INDENT.length - 4);
  const inner = Math.min(naturalWidth, maxInner);
  const border = style.muted;
  const toneStyle = (tone: BannerRow["tone"]): Style =>
    tone === "error" ? style.error : tone === "muted" ? style.muted : (value) => value;

  return [
    border(`╭${"─".repeat(inner + 2)}╮`),
    ...rows.map((row) => {
      const label = `${row.label}:`.padEnd(labelWidth);
      const value = truncate(row.value, inner - labelWidth, row.truncate);
      const padding = " ".repeat(inner - labelWidth - [...value].length);
      return `${border("│")} ${style.muted(label)}${toneStyle(row.tone)(value)}${padding} ${border("│")}`;
    }),
    border(`╰${"─".repeat(inner + 2)}╯`),
  ].map((line) => `${INDENT}${line}`);
}

/**
 * Renders the interactive welcome screen: a block-letter wordmark when the
 * terminal is wide enough (a compact inverse wordmark otherwise), a card with
 * the detected context, and an optional tip.
 */
export function renderBanner(options: BannerOptions): string[] {
  const style = { ...DEFAULT_STYLE, ...options.style };
  const columns = options.columns || process.stdout.columns || 80;
  const lines: string[] = [""];

  if (columns >= WORDMARK_WIDTH + INDENT.length + 1) {
    lines.push(...wordmarkLines(style).map((line) => `${INDENT}${line}`));
    lines.push(`${INDENT}${style.muted("C L I")}   ${style.muted(`v${options.version}`)}`);
  } else {
    lines.push(`${INDENT}${style.wordmark(" Appstack ")} ${style.muted(`v${options.version}`)}`);
  }

  if (options.rows.length) {
    lines.push("", ...card(options.rows, columns, style));
  }
  if (options.tip) {
    lines.push("", `${INDENT}${style.strong("Tip:")} ${options.tip}`);
  }
  lines.push("");
  return lines;
}
