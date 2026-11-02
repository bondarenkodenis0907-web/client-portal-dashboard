import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServerClient } from "@supabase/ssr";
import { cleanEnvironment } from "./local-tests.mjs";

const mode = process.argv[2] ?? "all";
const modes = mode === "all" ? ["vercel", "netlify", "unapproved"] : [mode];
if (
  modes.some(
    (value) =>
      !["vercel", "netlify", "unapproved", "maintenance"].includes(value),
  )
)
  throw new Error("Use all, vercel, netlify, unapproved or maintenance.");
const origin = "http://127.0.0.1:3011";
const backend = "http://127.0.0.1:56331";
const key = "sb_publishable_isolated_guard_test_placeholder";
const token =
  [
    { alg: "HS256", typ: "JWT" },
    {
      sub: "00000000-0000-0000-0000-000000000001",
      exp: 1,
      iat: 0,
      aud: "authenticated",
    },
  ]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .join(".") + ".local-test";
const cookieValue =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: token,
      refresh_token: "local-placeholder",
      expires_at: 1,
      expires_in: 3600,
      token_type: "bearer",
      user: { id: "00000000-0000-0000-0000-000000000001" },
    }),
  ).toString("base64url");
const cookie = { name: "sb-127-auth-token", value: cookieValue };
let backendCalls = 0;
const canary = createServer((_request, response) => {
  backendCalls++;
  response.writeHead(401, { "Content-Type": "application/json" });
  response.end(
    JSON.stringify({
      error: "invalid_grant",
      error_description: "Local test token rejected",
    }),
  );
});
await new Promise((accept, reject) => {
  canary.once("error", reject);
  canary.listen(56331, "127.0.0.1", accept);
});

async function build(env) {
  await new Promise((accept, reject) => {
    const child = spawn(
      process.execPath,
      [resolve("node_modules/next/dist/bin/next"), "build"],
      {
        env,
        stdio: "inherit",
        windowsHide: true,
      },
    );
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? accept()
        : reject(new Error(`Guard build failed (${code}).`)),
    );
  });
}

async function verify(target) {
  const env = {
    ...cleanEnvironment(process.env),
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL:
      target === "maintenance" ? "http://127.0.0.1:56321" : backend,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
    NEXT_TELEMETRY_DISABLED: "1",
    VERCEL: "",
    VERCEL_ENV: "",
    NETLIFY: "",
    CONTEXT: "",
    CLIENT_PORTAL_LOCAL_TESTS: target === "unapproved" ? "" : "1",
    CLIENT_PORTAL_MAINTENANCE: target === "maintenance" ? "1" : "",
  };
  if (target === "vercel") {
    env.VERCEL = "1";
    env.VERCEL_ENV = "preview";
  }
  // A misleading Vercel value must not override Netlify denial.
  if (target === "netlify") {
    env.NETLIFY = "true";
    env.CONTEXT = "deploy-preview";
    env.VERCEL_ENV = "production";
    env.VERCEL = "1";
  }
  await build(env);
  const server = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3011",
    ],
    {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  let serverError;
  server.on("error", (error) => {
    serverError = error;
  });
  for (const stream of [server.stdout, server.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      output = (output + chunk).slice(-2000);
    });
  }
  const closed = new Promise((accept) => server.once("close", accept));
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (serverError || server.exitCode !== null)
        throw new Error(`Next start failed: ${output}`);
      try {
        const response = await fetch(origin + "/login", {
          redirect: "manual",
          signal: AbortSignal.timeout(1000),
        });
        assert.equal(
          response.status,
          503,
          "Guard must be active before any route is served",
        );
        if (!response.bodyUsed) await response.body?.cancel();
        ready = true;
        break;
      } catch (error) {
        if (error.code === "ERR_ASSERTION") throw error;
        await delay(200);
      }
    }
    assert.ok(ready, "Next.js did not become ready");
    const routes = [
      "/",
      "/login",
      "/dashboard",
      "/dashboard/requests",
      "/dashboard/requests/anything.svg",
      "/icon.svg",
      "/_next/static/probe.js",
      "/_next/image?url=probe&w=64&q=75",
      "/forgot-password",
      "/reset-password",
      "/auth/callback",
      "/auth/confirm",
      "/auth/verify-recovery",
      "/auth/recovery-session",
      "/auth/update-password",
      "/auth/finish-recovery",
    ];
    let checked = 0;
    for (const route of routes) {
      for (const method of ["GET", "HEAD", "POST"]) {
        const response = await fetch(origin + route, {
          method,
          redirect: "manual",
          signal: AbortSignal.timeout(2000),
          headers: {
            Host:
              target === "maintenance" ? "127.0.0.1" : "preview.example.test",
            Cookie: `${cookie.name}=${cookie.value}`,
            "X-Forwarded-Host": "localhost",
          },
        });
        assert.equal(response.status, 503, `${target}: ${method} ${route}`);
        if (target === "maintenance") {
          assert.equal(response.headers.get("retry-after"), "60");
          if (method !== "HEAD")
            assert.match(
              await response.text(),
              /Portal temporarily unavailable/,
            );
        }
        assert.match(response.headers.get("cache-control") ?? "", /no-store/);
        assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
        assert.equal(
          response.headers.get("set-cookie"),
          null,
          "Denied requests must not refresh Auth cookies",
        );
        if (!response.bodyUsed) await response.body?.cancel();
        checked++;
      }
    }
    assert.equal(
      backendCalls,
      0,
      "Denied requests must never reach Supabase Auth/REST",
    );
    console.log(
      target === "maintenance"
        ? `PASS: maintenance, ${checked} HTTP checks, Retry-After, no Auth cookies`
        : `PASS: ${target}, ${checked} HTTP checks, no Auth cookies, 0 backend calls`,
    );
  } finally {
    if (server.exitCode === null) server.kill("SIGTERM");
    await Promise.race([
      closed,
      delay(5000).then(() => {
        throw new Error("Next test process did not stop");
      }),
    ]);
  }
}

try {
  // Positive control: the same expired cookie really would call Auth without a guard.
  const client = createServerClient(backend, key, {
    cookies: { getAll: () => [cookie], setAll: () => {} },
  });
  await client.auth.getClaims();
  assert.ok(backendCalls > 0, "Auth canary/cookie positive control failed");
  backendCalls = 0;
  for (const target of modes) await verify(target);
} finally {
  canary.closeAllConnections();
  await new Promise((accept) => canary.close(accept));
}
