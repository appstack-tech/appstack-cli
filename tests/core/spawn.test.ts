import assert from "node:assert/strict";
import test from "node:test";
import { redactDiagnostic, spawnFailure, spawnLines } from "@/core/agent/spawn";

test("captures and redacts bounded process diagnostics", async () => {
  const secret = "pk_test_should_never_escape_123456";
  const result = await spawnLines({
    bin: process.execPath,
    args: ["-e", `process.stderr.write("API_KEY=${secret}\\n"); process.exit(7)`],
    cwd: process.cwd(),
    onStdout() {},
    sensitiveValues: [secret],
  });

  assert.equal(result.code, 7);
  assert.doesNotMatch(result.stderr ?? "", new RegExp(secret));
  assert.match(spawnFailure(result) ?? "", /REDACTED/);
  assert.equal(redactDiagnostic(`failed with ${secret}`, [secret]), "failed with [REDACTED]");
});
