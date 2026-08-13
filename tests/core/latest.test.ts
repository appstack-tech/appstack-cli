import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions } from "@/core/sdk/latest";

test("compares semantic versions", () => {
  assert.equal(compareVersions("2.6.0", "2.5.0") > 0, true);
  assert.equal(compareVersions("4.5.0", "4.5.0"), 0);
  assert.equal(compareVersions("1.7.0", "2.0.0") < 0, true);
});
