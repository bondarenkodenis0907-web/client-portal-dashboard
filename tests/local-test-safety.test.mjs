import assert from "node:assert/strict";
import test from "node:test";
import {
  apiOrigin,
  assertTestStatus,
  cleanEnvironment,
} from "../scripts/local-tests.mjs";

const credentials = {
  PUBLISHABLE_KEY: "local-placeholder",
  SECRET_KEY: "local-placeholder",
};

test("only the dedicated loopback backend can reach mutating browser tests", () => {
  assert.doesNotThrow(() =>
    assertTestStatus({ API_URL: apiOrigin, ...credentials }),
  );
  for (const API_URL of [
    "https://example.supabase.co",
    "http://127.0.0.1:55321",
    "http://127.0.0.1:54321",
    "http://localhost:56321",
    "http://127.0.0.1:56321@evil.example",
    "http://127.0.0.1:56321/extra",
  ])
    assert.throws(() => assertTestStatus({ API_URL, ...credentials }));
});

test("missing local credentials fail closed", () => {
  assert.throws(() => assertTestStatus({ API_URL: apiOrigin }));
});

test("cloud credentials and host flags are not inherited", () => {
  assert.deepEqual(
    cleanEnvironment({
      PATH: "tools",
      SUPABASE_ACCESS_TOKEN: "cloud-placeholder",
      SUPABASE_DB_PASSWORD: "cloud-placeholder",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      TEST_SUPABASE_SECRET_KEY: "cloud-placeholder",
      VERCEL_ENV: "production",
      NETLIFY: "true",
      CONTEXT: "production",
      CLIENT_PORTAL_LOCAL_TESTS: "1",
      CLIENT_PORTAL_MAINTENANCE: "1",
      RECOVERY_SIGNING_SECRET: "cloud-placeholder",
    }),
    { PATH: "tools" },
  );
});
