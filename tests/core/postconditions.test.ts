import assert from "node:assert/strict";
import test from "node:test";
import type { Inspection } from "@/core/sdk/inspect";
import { verifyWorkflowPostconditions } from "@/core/sdk/postconditions";

function inspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    project: {
      framework: "react-native",
      frameworkLabel: "React Native",
      path: "/tmp/example",
      relativePath: ".",
      name: "example",
    },
    installed: true,
    installedVersion: "2.6.0",
    installedVersionSource: "lockfile",
    configureCount: 1,
    eventCallCount: 0,
    customEventNames: [],
    partners: [],
    findings: [],
    ...overrides,
  };
}

test("integration requires both the dependency and initialization", () => {
  const after = inspection({
    installed: false,
    installedVersion: undefined,
    configureCount: 0,
    findings: [
      {
        code: "sdk-not-installed",
        severity: "error",
        message: "missing",
      },
      {
        code: "configure-missing",
        severity: "error",
        message: "missing",
      },
    ],
  });

  const result = verifyWorkflowPostconditions({
    workflow: "integrate",
    after,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /still not installed/);
  assert.match(result.errors.join(" "), /initialization is still missing/);
});

test("upgrade requires the requested version after the agent exits", () => {
  const result = verifyWorkflowPostconditions({
    workflow: "upgrade",
    after: inspection({ installedVersion: "2.5.1" }),
    targetVersion: "2.6.0",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /Expected SDK 2.6.0, but detected 2.5.1/);
});

test("upgrade accepts the verified target version", () => {
  const result = verifyWorkflowPostconditions({
    workflow: "upgrade",
    after: inspection({ installedVersion: "2.6.0" }),
    targetVersion: "2.6.0",
  });
  assert.deepEqual(result, { ok: true, errors: [] });
});

test("React Native upgrade requires a lockfile-resolved version", () => {
  const result = verifyWorkflowPostconditions({
    workflow: "upgrade",
    after: inspection({ installedVersionSource: "manifest" }),
    targetVersion: "2.6.0",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /not resolved from a lockfile/);
});

test("upgrade fails while React Native 2.x call shapes remain", () => {
  const result = verifyWorkflowPostconditions({
    workflow: "upgrade",
    targetVersion: "3.5.1",
    after: inspection({
      installedVersion: "3.5.1",
      findings: [{
        code: "react-native-removed-api",
        severity: "error",
        message: "removed",
        files: ["src/appstack.ts"],
      }],
    }),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /Removed 2\.x call shapes remain in src\/appstack\.ts/);
});
