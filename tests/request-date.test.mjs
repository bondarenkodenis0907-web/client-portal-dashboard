import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("request timestamps are identical across server/browser host zones and identify UTC", () => {
  const url = new URL("../src/lib/requests.ts", import.meta.url).href;
  const outputs = ["UTC", "Europe/Moscow", "America/New_York"].map((TZ) => {
    const r = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {formatRequestDate} from ${JSON.stringify(url)}; console.log(formatRequestDate('2026-10-30T00:15:00Z'));console.log(formatRequestDate('2026-10-30T23:30:00Z'));`,
      ],
      { env: { ...process.env, TZ }, encoding: "utf8" },
    );
    assert.equal(r.status, 0);
    return r.stdout.trim();
  });
  assert.equal(new Set(outputs).size, 1);
  assert.match(outputs[0], /12:15 AM UTC/);
  assert.match(outputs[0], /11:30 PM UTC/);
});
