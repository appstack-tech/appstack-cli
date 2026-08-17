import pc from "picocolors";

type InlineStyle = "plain" | "strong" | "emphasis" | "code" | "link" | "muted";

interface InlineToken {
  text: string;
  style: InlineStyle;
  href?: string;
}

const INLINE_MARKUP = /(\*\*([^*]+?)\*\*|__([^_]+?)__|`([^`]+?)`|\[([^\]]+?)\]\(([^)]+?)\)|\*([^*]+?)\*)/g;

function cleanText(value: string): string {
  return value.replaceAll("\\`", "`").replaceAll("\\*", "*");
}

function inlineTokens(value: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let cursor = 0;
  for (const match of value.matchAll(INLINE_MARKUP)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      tokens.push({ text: cleanText(value.slice(cursor, index)), style: "plain" });
    }
    if (match[2] !== undefined || match[3] !== undefined) {
      tokens.push({
        text: cleanText(match[2] ?? match[3] ?? "").replace(/`([^`]+)`/g, "$1"),
        style: "strong",
      });
    } else if (match[4] !== undefined) {
      tokens.push({ text: cleanText(match[4]), style: "code" });
    } else if (match[5] !== undefined) {
      tokens.push({
        text: cleanText(match[5]),
        style: "link",
        href: cleanText(match[6] ?? ""),
      });
    } else {
      tokens.push({ text: cleanText(match[7] ?? ""), style: "emphasis" });
    }
    cursor = index + match[0].length;
  }
  if (cursor < value.length) {
    tokens.push({ text: cleanText(value.slice(cursor)), style: "plain" });
  }
  return tokens;
}

function renderToken(token: InlineToken): string {
  switch (token.style) {
    case "strong":
      return pc.bold(token.text);
    case "emphasis":
      return pc.italic(token.text);
    case "code":
      return pc.dim(token.text);
    case "link":
      return terminalLink(token.text, token.href);
    case "muted":
      return pc.dim(token.text);
    default:
      return token.text;
  }
}

function terminalLink(label: string, href?: string): string {
  const safe = href?.replace(/[\u0000-\u001F\u007F]/g, "");
  if (!safe || !/^(https?:\/\/|file:\/\/|\/)/.test(safe)) return pc.underline(label);
  const target = safe.startsWith("/") ? `file://${safe}` : safe;
  return `\u001B]8;;${target}\u0007${pc.underline(label)}\u001B]8;;\u0007`;
}

function textWidth(value: string): number {
  return Array.from(value).length;
}

function appendToken(tokens: InlineToken[], token: InlineToken): void {
  const previous = tokens.at(-1);
  if (previous?.style === token.style && previous.href === token.href) previous.text += token.text;
  else tokens.push({ ...token });
}

function wrapTokens(
  tokens: InlineToken[],
  width: number,
  firstPrefix = "",
  restPrefix = firstPrefix,
): string[] {
  const lines: string[] = [];
  let line: InlineToken[] = [];
  let lineWidth = 0;
  let first = true;
  let pendingSpace: InlineStyle | undefined;

  const available = () => Math.max(1, width - textWidth(first ? firstPrefix : restPrefix));
  const flush = () => {
    const prefix = first ? firstPrefix : restPrefix;
    lines.push(`${prefix}${line.map(renderToken).join("")}`.trimEnd());
    line = [];
    lineWidth = 0;
    pendingSpace = undefined;
    first = false;
  };

  for (const token of tokens) {
    const chunks = token.text.replaceAll("\t", "  ").split(/(\s+)/).filter(Boolean);
    for (const chunk of chunks) {
      if (/^\s+$/.test(chunk)) {
        if (lineWidth > 0) pendingSpace = token.style;
        continue;
      }

      const characters = Array.from(chunk);
      const spaceWidth = pendingSpace && lineWidth > 0 ? 1 : 0;
      if (lineWidth > 0 && lineWidth + spaceWidth + characters.length > available()) {
        flush();
      }
      if (pendingSpace && lineWidth > 0) {
        appendToken(line, { text: " ", style: pendingSpace });
        lineWidth += 1;
      }
      pendingSpace = undefined;

      let offset = 0;
      while (offset < characters.length) {
        const capacity = available() - lineWidth;
        if (capacity <= 0) {
          flush();
          continue;
        }
        const part = characters.slice(offset, offset + capacity).join("");
        appendToken(line, { text: part, style: token.style });
        lineWidth += textWidth(part);
        offset += textWidth(part);
        if (offset < characters.length) flush();
      }
    }
  }
  if (line.length || !lines.length) flush();
  return lines;
}

function isBlockStart(line: string): boolean {
  return (
    /^\s*$/.test(line) ||
    /^#{1,6}\s+/.test(line) ||
    /^\s*([-+*]|\d+[.)])\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*```/.test(line) ||
    /^\s*(---+|___+|\*\*\*+)\s*$/.test(line)
  );
}

function plainTokens(value: string): InlineToken[] {
  return [{ text: value, style: "plain" }];
}

export function reportWidth(columns = process.stdout.columns ?? 100): number {
  return Math.max(8, Math.min(100, columns - 4));
}

export function renderTerminalMarkdown(markdown: string, width: number): string[] {
  const source = markdown.replaceAll("\r\n", "\n").trim();
  if (!source) return [];
  const input = source.split("\n");
  const output: string[] = [];
  let index = 0;

  const blank = () => {
    if (output.length && output.at(-1) !== "") output.push("");
  };

  while (index < input.length) {
    const line = input[index] ?? "";
    if (!line.trim()) {
      blank();
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```(?:\w+)?\s*$/);
    if (fence) {
      blank();
      index += 1;
      while (index < input.length && !/^\s*```\s*$/.test(input[index] ?? "")) {
        output.push(
          ...wrapTokens(plainTokens(input[index] ?? ""), width, pc.dim("│ "), pc.dim("│ ")),
        );
        index += 1;
      }
      if (index < input.length) index += 1;
      blank();
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (heading) {
      blank();
      const rendered = wrapTokens(inlineTokens(heading[1] ?? ""), width);
      output.push(...rendered.map((value) => pc.bold(value)));
      index += 1;
      continue;
    }

    if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
      blank();
      output.push(pc.dim("─".repeat(Math.min(width, 48))));
      blank();
      index += 1;
      continue;
    }

    const list = line.match(/^(\s*)([-+*]|\d+[.)])\s+(.+)$/);
    if (list) {
      const level = Math.floor((list[1]?.length ?? 0) / 2);
      const marker = /^\d/.test(list[2] ?? "") ? list[2]! : "•";
      const prefix = `${"  ".repeat(level)}${marker} `;
      output.push(
        ...wrapTokens(
          inlineTokens(list[3] ?? ""),
          width,
          prefix,
          " ".repeat(textWidth(prefix)),
        ),
      );
      index += 1;
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      output.push(
        ...wrapTokens(inlineTokens(quote[1] ?? ""), width, pc.dim("│ "), pc.dim("│ ")),
      );
      index += 1;
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < input.length && !isBlockStart(input[index] ?? "")) {
      paragraph.push((input[index] ?? "").trim());
      index += 1;
    }
    output.push(...wrapTokens(inlineTokens(paragraph.join(" ")), width));
  }

  while (output.at(-1) === "") output.pop();
  return output;
}
