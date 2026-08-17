import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import test from "node:test";
import { renderTerminalMarkdown, reportWidth } from "@/markdown";

const review = `# Review

## Findings

1. **Privacy manifest is incomplete** — \`NSPrivacyCollectedDataTypes\` is absent.

This is a long explanation with [source evidence](/Users/example/AppstackAttributionSdk.swift#L273) and enough additional words to require wrapping in a narrow terminal without breaking the surrounding report layout.

> Verify this before release.

\`\`\`swift
Appstack.configure(apiKey: key)
\`\`\``;

test("renders review markdown within the available terminal width", () => {
  const width = 48;
  const lines = renderTerminalMarkdown(review, width);

  assert.ok(lines.length > 8);
  assert.ok(
    lines.every((line) => Array.from(stripVTControlCharacters(line)).length <= width),
  );
  assert.doesNotMatch(lines.join("\n"), /\*\*|```|\[[^\]]+\]\([^)]+\)/);
  assert.doesNotMatch(lines.join("\n"), /`NSPrivacyCollectedDataTypes`/);
  assert.match(lines.join("\n"), /1\. Privacy manifest is incomplete/);
  assert.match(lines.join("\n"), /source evidence/);
  assert.match(lines.join("\n"), /Appstack\.configure/);
  assert.doesNotMatch(
    stripVTControlCharacters(lines.join("\n")),
    /\/Users\/example\/AppstackAttributionSdk/,
  );
});

test("hard-wraps long paths instead of relying on the terminal", () => {
  const lines = renderTerminalMarkdown(
    "/Users/example/a-very-long-directory-name/AppstackAttributionSdk.swift#L273",
    24,
  );

  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => stripVTControlCharacters(line).length <= 24));
});

test("reserves report space for the TUI rail and caps reading width", () => {
  assert.equal(reportWidth(40), 36);
  assert.equal(reportWidth(160), 100);
  assert.equal(reportWidth(12), 8);
});
