import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runRestoreDrill } from "./restore-drill.mjs";
import { root, command } from "./restore-target.mjs";
import { projectId } from "./local-tests.mjs";
import { restoreSavedBackup } from "./restore-backup.mjs";

// The producer stops/cleans both owned profiles. The consumer must work alone.
const { runId, key } = await runRestoreDrill("drill");
function assertSourceStopped() {
  assert.equal(
    command("docker", [
      "ps",
      "--filter",
      `label=com.supabase.cli.project=${projectId}`,
      "--format",
      "{{.ID}}",
    ]),
    "",
    "Saved restore must not start the source",
  );
}
try {
  assertSourceStopped();
  await restoreSavedBackup(runId, key);
} finally {
  key.fill(0);
}
assertSourceStopped();
const report = JSON.parse(
  readFileSync(
    join(root, ".local-backups", runId, "independent-restore-report.json"),
  ),
);
assert.equal(report.result, "PASS");
assert.equal(report.cleaned, true);
assert.equal(report.stopped, true);
assert.equal(report.sourceStartedOrConnected, false);
assert.equal(report.inventoryEqual, true);
console.log(
  `PASS: fresh drill and independent saved-backup consumer; ${report.sqlRegressionTests} archived SQL checks; source stayed stopped.`,
);
