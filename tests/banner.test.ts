import assert from "node:assert/strict";
import test from "node:test";
import { displayPath, renderBanner, visibleWidth, WORDMARK_WIDTH } from "@/banner";

const plain = (value: string) => value;
const style = { block: plain, shadow: plain, muted: plain, strong: plain, error: plain, wordmark: plain };
const rows = [
  { label: "app", value: "Demo · Unity" },
  { label: "directory", value: "~/Developer/demo" },
];

test("renders the block wordmark and a context card on wide terminals", () => {
  const lines = renderBanner({ version: "1.2.3", rows, tip: "Try it.", columns: 100, style });
  assert.ok(lines.some((line) => line.includes("███████╗")));
  assert.ok(lines.some((line) => line.includes("C L I   v1.2.3")));
  assert.ok(lines.some((line) => /│ app:\s+Demo · Unity\s+│/.test(line)));
  assert.ok(lines.includes("  Tip: Try it."));
  const card = lines.filter((line) => /[╭│╰]/.test(line));
  assert.equal(new Set(card.map(visibleWidth)).size, 1, "card rows share one width");
});

test("falls back to a compact wordmark on narrow terminals", () => {
  const lines = renderBanner({ version: "1.2.3", rows, columns: WORDMARK_WIDTH, style });
  assert.ok(lines.some((line) => line.includes(" Appstack  v1.2.3")));
  assert.ok(!lines.some((line) => line.includes("█")));
});

test("truncates card values to fit the terminal", () => {
  const long = [{ label: "directory", value: "x".repeat(200) }];
  const lines = renderBanner({ version: "1.2.3", rows: long, columns: 40, style });
  for (const line of lines) assert.ok(visibleWidth(line) <= 40, line);
  assert.ok(lines.some((line) => line.includes("…")));
});

test("keeps the tail of rows truncated from the start", () => {
  const path = [{ label: "directory", value: `/${"a".repeat(80)}/DemoGame`, truncate: "start" as const }];
  const lines = renderBanner({ version: "1.2.3", rows: path, columns: 50, style });
  assert.ok(lines.some((line) => /│ directory: …a+\/DemoGame │/.test(line)));
});

test("abbreviates the home directory", () => {
  assert.equal(displayPath("/Users/me/app", "/Users/me"), "~/app");
  assert.equal(displayPath("/Users/meta/app", "/Users/me"), "/Users/meta/app");
});
