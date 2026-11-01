import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest } from "next/server.js";
import { isTransientAuthError } from "../src/lib/auth-errors.ts";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(
  readFileSync(
    new URL("../src/lib/supabase/proxy.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

async function responseFor(
  result,
  { clear = false, rotate = false, thrown = false } = {},
) {
  const sandbox = {
    exports: {},
    process: { env: {} },
    require: (name) => {
      if (name === "@/lib/auth-errors") return { isTransientAuthError };
      if (name !== "@supabase/ssr") return require(name);
      return {
        createServerClient: (_url, _key, options) => ({
          auth: {
            getClaims: async () => {
              if (thrown) throw new Error("Synthetic transport outage");
              if (clear)
                options.cookies.setAll(
                  [
                    {
                      name: "synthetic-session",
                      value: "",
                      options: { path: "/", maxAge: 0 },
                    },
                  ],
                  { "Cache-Control": "private, no-store", Pragma: "no-cache" },
                );
              if (rotate)
                options.cookies.setAll(
                  [
                    {
                      name: "synthetic-session",
                      value: "rotated",
                      options: { path: "/" },
                    },
                  ],
                  { "Cache-Control": "private, no-store", Pragma: "no-cache" },
                );
              return result;
            },
          },
        }),
      };
    },
  };
  runInNewContext(source, sandbox);
  return sandbox.exports.updateSession(
    new NextRequest("http://localhost/dashboard/requests", {
      headers: { cookie: "synthetic-session=retained" },
    }),
  );
}

test("Proxy returns retryable 503 for temporary Auth failures without redirecting or clearing cookies", async () => {
  for (const error of [
    { status: 503, name: "AuthRetryableFetchError" },
    { status: 500, name: "AuthApiError" },
    { status: 429, name: "AuthApiError" },
    { name: "AuthRetryableFetchError" },
  ]) {
    const response = await responseFor({ data: null, error });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
    assert.equal(response.headers.get("retry-after"), "5");
    assert.doesNotMatch(await response.text(), /synthetic-session|retained/);
  }
});

test("Proxy keeps guest and explicit Auth rejection redirects, including refresh-token 400 and cleanup cookies", async () => {
  for (const error of [
    null,
    { name: "AuthSessionMissingError" },
    { status: 400, name: "AuthApiError", code: "refresh_token_not_found" },
    { status: 401, name: "AuthApiError" },
    { status: 403, name: "AuthApiError" },
  ]) {
    const response = await responseFor({ data: null, error }, { clear: true });
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location")).pathname, "/login");
    assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
    assert.equal(response.headers.get("pragma"), "no-cache");
  }
});

test("Proxy admits verified claims and fails closed with a retryable response on a thrown transport error", async () => {
  const allowed = await responseFor({
    data: { claims: { sub: "synthetic-user" } },
    error: null,
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("x-middleware-next"), "1");
  assert.match(allowed.headers.get("cache-control"), /private.*no-store/);
  const failed = await responseFor(null, { thrown: true });
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("location"), null);
  assert.equal(failed.headers.get("x-middleware-next"), null);
});

test("Proxy forwards rotated cookies when verification fails after a successful refresh", async () => {
  const response = await responseFor(
    { data: null, error: { status: 503, name: "AuthRetryableFetchError" } },
    { rotate: true },
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("location"), null);
  assert.match(response.headers.get("set-cookie"), /synthetic-session=rotated/);
  assert.match(response.headers.get("cache-control"), /private.*no-store/);
  assert.equal(response.headers.get("pragma"), "no-cache");
});
