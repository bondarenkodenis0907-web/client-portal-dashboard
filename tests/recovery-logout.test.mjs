import assert from "node:assert/strict";
import test from "node:test";
import { createServerClient } from "@supabase/ssr";
import { finishRecoverySignOut } from "../src/lib/recovery-actions.ts";

function fixture() {
  const token =
    [
      { alg: "HS256" },
      { sub: "synthetic-user", exp: Math.floor(Date.now() / 1000) + 3600 },
    ]
      .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
      .join(".") + ".synthetic";
  const jar = new Map([
    [
      "sb-127-auth-token",
      "base64-" +
        Buffer.from(
          JSON.stringify({
            access_token: token,
            refresh_token: "synthetic-refresh",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: "bearer",
            user: { id: "synthetic-user", aud: "authenticated" },
          }),
        ).toString("base64url"),
    ],
  ]);
  let status = 503;
  const calls = [];
  const client = () =>
    createServerClient(
      "http://127.0.0.1:56321",
      "sb_publishable_synthetic_test_placeholder",
      {
        cookies: {
          getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: (items) =>
            items.forEach(({ name, value, options }) =>
              options?.maxAge === 0 ? jar.delete(name) : jar.set(name, value),
            ),
        },
        global: {
          fetch: async (url) => {
            calls.push(new URL(url).searchParams.get("scope"));
            return status === 204
              ? new Response(null, { status: 204 })
              : new Response(
                  JSON.stringify({
                    code: "unexpected_failure",
                    msg: "Synthetic failure",
                  }),
                  { status, headers: { "Content-Type": "application/json" } },
                );
          },
        },
      },
    );
  return {
    jar,
    calls,
    client,
    setStatus: (v) => {
      status = v;
    },
  };
}

test("real SSR SDK keeps failed logout retryable and confirms a server request before clearing cookies", async () => {
  const f = fixture();
  assert.equal(await finishRecoverySignOut(f.client().auth), false);
  assert.ok(f.jar.has("sb-127-auth-token"));
  assert.deepEqual(f.calls, ["global"]);
  f.setStatus(204);
  assert.equal(await finishRecoverySignOut(f.client().auth), true);
  assert.deepEqual(f.calls, ["global", "global", "local"]);
  assert.equal(f.jar.has("sb-127-auth-token"), false);
});

test("missing sessions and rejected credentials never confirm global logout", async () => {
  const f = fixture();
  f.jar.clear();
  assert.equal(await finishRecoverySignOut(f.client().auth), false);
  assert.deepEqual(f.calls, []);
  for (const status of [401, 403]) {
    const bad = fixture();
    bad.setStatus(status);
    assert.equal(await finishRecoverySignOut(bad.client().auth), false);
    assert.deepEqual(bad.calls, ["global"]);
    assert.ok(bad.jar.has("sb-127-auth-token"));
  }
});
