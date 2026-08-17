import assert from "node:assert/strict";
import test from "node:test";
import { errorOutput, wantsJson } from "@/output";

test("detects explicit JSON output requests", () => {
  assert.equal(wantsJson(["review", "--json"]), true);
  assert.equal(wantsJson(["review", "--json=true"]), true);
  assert.equal(wantsJson(["review", "--json=false"]), false);
  assert.equal(wantsJson(["review", "--json", "--no-json"]), false);
});

test("normalizes argument and command errors for machine output", () => {
  assert.deepEqual(errorOutput(new Error("Unknown argument: nope")), {
    error: { code: "invalid_arguments", message: "Unknown argument: nope" },
  });
  assert.deepEqual(errorOutput(new Error("No supported app found.")), {
    error: { code: "command_error", message: "No supported app found." },
  });
});
