import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Run against an isolated Vercel Preview or Netlify deploy-preview build.
// Only dummy Supabase build credentials are allowed; never contact live Auth.
const target = process.argv[2] ?? "vercel";
if (!["vercel", "netlify", "unapproved"].includes(target)) {
  throw new Error("Specify vercel, netlify or unapproved");
}
const ports = { vercel: 3011, netlify: 3012, unapproved: 3013 };
const port = ports[target];
const origin = `http://127.0.0.1:${port}`;
const routes = ["/", "/login", "/dashboard", "/dashboard/requests"];
const server = spawn(
  process.execPath,
  [resolve("node_modules/next/dist/bin/next"), "start", "--port", String(port)],
  {
    env: {
      ...process.env,
      VERCEL_ENV: target === "vercel" ? "preview" : "",
      NETLIFY: target === "netlify" ? "true" : "",
      CONTEXT: target === "netlify" ? "deploy-preview" : "",
      CLIENT_PORTAL_LOCAL_TESTS: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverOutput = "";
for (const output of [server.stdout, server.stderr]) {
  output.setEncoding("utf8");
  output.on("data", (chunk) => {
    serverOutput = (serverOutput + chunk).slice(-2000);
  });
}

async function check(route, method = "GET") {
  const response = await fetch(`${origin}${route}`, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(2_000),
  });
  if (response.status !== 503) {
    throw new Error(`expected 503: ${method} ${route} got ${response.status}`);
  }
  const cacheControl = response.headers.get("cache-control") ?? "";
  if (!cacheControl.includes("no-store")) {
    throw new Error(`${method} ${route}: missing no-store cache control`);
  }
}

try {
  let listening = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited early: ${serverOutput}`);
    }
    try {
      await check("/login");
      listening = true;
      break;
    } catch (error) {
      if (
        String(error).includes("expected 503") ||
        String(error).includes("missing no-store")
      ) {
        throw error;
      }
      await delay(250);
    }
  }
  if (!listening) throw new Error(`Next.js did not start: ${serverOutput}`);

  for (const route of routes) {
    await check(route);
  }
  await check("/dashboard/requests", "POST");
  console.log(`PASS: ${target} Preview routes and POST return 503 (no-store)`);
} finally {
  server.kill("SIGTERM");
}
