import assert from "node:assert/strict";
import test from "node:test";
import {
  createStatusStream,
  extractStatus,
  redactDiagnostic,
  spawnFailure,
  spawnLines,
  statusMessages,
} from "@/core/agent/spawn";

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

test("reports the most recent status when markers share a line", () => {
  assert.deepEqual(statusMessages("Exploring.[STATUS] Reading config.[STATUS] Done"), ["Reading config.", "Done"]);
  assert.equal(extractStatus("[STATUS] Reading\nsome text\n[STATUS] Checking lockfile"), "Checking lockfile");
  assert.equal(extractStatus("no markers here"), undefined);
});

test("streams statuses only for completed lines", () => {
  const seen: string[] = [];
  const stream = createStatusStream((status) => seen.push(status));
  for (const delta of ["[STATUS] Read", "ing the app", " config\n[STATUS] Chec", "king"]) {
    stream.push(delta);
  }
  assert.deepEqual(seen, ["Reading the app config"]);
  stream.end();
  stream.push("[STATUS] Checking");
  stream.end();
  assert.deepEqual(seen, ["Reading the app config", "Checking"]);
});
