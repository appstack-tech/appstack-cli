import assert from "node:assert/strict";
import test from "node:test";
import { APPSTACK_COLORS, theme } from "@/theme";

test("defines the Appstack terminal palette", () => {
  assert.deepEqual(APPSTACK_COLORS, {
    ink: "#0D0D0D",
    paper: "#FAFAFA",
    muted: "#8A8A8A",
    success: "#3DB15E",
  });
});

test("theme formatters preserve their content", () => {
  assert.match(theme.primary("Appstack"), /Appstack/);
  assert.match(theme.wordmark(" Appstack "), / Appstack /);
  assert.match(theme.success("done"), /done/);
});
