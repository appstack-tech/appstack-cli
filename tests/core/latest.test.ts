import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, isValidVersion } from "@/core/sdk/latest";

test("compares semantic versions", () => {
  assert.equal(compareVersions("2.6.0", "2.5.0") > 0, true);
  assert.equal(compareVersions("4.5.0", "4.5.0"), 0);
  assert.equal(compareVersions("1.7.0", "2.0.0") < 0, true);
});

test("orders prereleases before stable versions", () => {
  assert.equal(compareVersions("4.5.0-rc.1", "4.5.0") < 0, true);
  assert.equal(compareVersions("4.5.0-rc.2", "4.5.0-rc.10") < 0, true);
  assert.equal(compareVersions("v4.5.0", "4.5.0"), 0);
});

test("validates explicit SDK versions", () => {
  assert.equal(isValidVersion("2.6.0"), true);
  assert.equal(isValidVersion("v2.6.0-rc.1"), true);
  assert.equal(isValidVersion("latest"), false);
  assert.equal(isValidVersion("not-a-version"), false);
});
