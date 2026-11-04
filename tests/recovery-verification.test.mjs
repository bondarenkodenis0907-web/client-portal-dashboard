import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server.js";
import * as policy from "../src/lib/recovery-policy.ts";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(
  readFileSync(
    new URL("../src/app/auth/verify-recovery/route.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

async function verify({
  stage,
  error,
  thrown = false,
  mismatch = false,
  secretMissing = false,
} = {}) {
  const calls = [];
  let grants = 0;
  const results = {
    verifyOtp: { data: { session: {} }, error: null },
    getClaims: {
      data: {
        claims: { sub: "synthetic-user", session_id: "synthetic-session" },
      },
      error: null,
    },
    getUser: {
      data: {
        user: {
          id: mismatch ? "other-user" : "synthetic-user",
          updated_at: "2026-11-04T00:00:00Z",
        },
      },
      error: null,
    },
  };
  const auth = Object.fromEntries(
    Object.keys(results).map((name) => [
      name,
      async () => {
        calls.push(name);
        if (stage === name && thrown)
          throw new Error("Synthetic transport failure");
        return stage === name ? { data: null, error } : results[name];
      },
    ]),
  );
  const sandbox = {
    exports: {},
    process: { env: {} },
    URL,
    URLSearchParams,
    require: (name) => {
      if (name === "@/lib/recovery-policy") return policy;
      if (name === "@/lib/supabase/server")
        return { createClient: async () => ({ auth }) };
      if (name === "@/lib/recovery-response")
        return {
          recoveryRedirect: (location) =>
            new NextResponse(null, {
              status: 303,
              headers: { ...policy.recoveryHeaders, Location: location },
            }),
        };
      if (name === "@/lib/recovery-grant")
        return {
          recoveryCookie: "synthetic-grant",
          recoverySecret: () => {
            if (secretMissing) throw new Error("Missing signing secret");
            return "synthetic-secret";
          },
          issueRecoveryGrant: () => {
            grants++;
            return "synthetic-signed-grant";
          },
        };
      return require(name);
    },
  };
  runInNewContext(source, sandbox);
  const response = await sandbox.exports.POST(
    new Request("https://portal.example.test/auth/verify-recovery", {
      method: "POST",
      headers: {
        origin: "https://portal.example.test",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        token_hash: "synthetic_token_hash_1234567890",
      }),
    }),
  );
  return { response, calls, grants };
}

test("recovery verification distinguishes returned outages at every Auth step without granting access", async () => {
  for (const stage of ["verifyOtp", "getClaims", "getUser"]) {
    for (const error of [
      { status: 503 },
      { status: 500 },
      { status: 429 },
      { status: 408 },
      { name: "AuthRetryableFetchError" },
    ]) {
      const { response, calls, grants } = await verify({ stage, error });
      assert.equal(response.status, 503, `${stage}: ${JSON.stringify(error)}`);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.match(response.headers.get("cache-control"), /private.*no-store/);
      assert.equal(calls.at(-1), stage);
      assert.equal(grants, 0);
      const text = await response.text();
      assert.match(text, /new.*link/i);
      assert.doesNotMatch(
        text,
        /synthetic_token|synthetic-user|synthetic-session/,
      );
    }
  }
});

test("recovery verification handles thrown transport failures at every Auth step", async () => {
  for (const stage of ["verifyOtp", "getClaims", "getUser"]) {
    const { response, grants } = await verify({ stage, thrown: true });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(grants, 0);
  }
});

test("recovery verification preserves explicit rejection and expired OTP behavior", async () => {
  for (const stage of ["verifyOtp", "getClaims", "getUser"]) {
    for (const error of [
      { status: 400, code: "otp_expired" },
      { status: 401 },
      { status: 403 },
      { status: 422 },
      { name: "AuthSessionMissingError" },
    ]) {
      const { response, grants } = await verify({ stage, error });
      assert.equal(response.status, 303);
      assert.equal(
        response.headers.get("location"),
        "/forgot-password?status=invalid",
      );
      assert.equal(grants, 0);
    }
  }
});

test("recovery verification requires matching identities before issuing a grant", async () => {
  const { response, grants } = await verify({ mismatch: true });
  assert.equal(
    response.headers.get("location"),
    "/forgot-password?status=invalid",
  );
  assert.equal(grants, 0);
});

test("recovery verification checks signing configuration before consuming OTP", async () => {
  const { response, calls, grants } = await verify({ secretMissing: true });
  assert.equal(response.status, 503);
  assert.deepEqual(calls, []);
  assert.equal(grants, 0);
});

test("recovery verification issues one protected grant only after all Auth checks succeed", async () => {
  const { response, calls, grants } = await verify();
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/reset-password");
  assert.deepEqual(calls, ["verifyOtp", "getClaims", "getUser"]);
  assert.equal(grants, 1);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  assert.match(response.headers.get("set-cookie"), /Secure/);
  assert.match(response.headers.get("set-cookie"), /SameSite=strict/i);
});
