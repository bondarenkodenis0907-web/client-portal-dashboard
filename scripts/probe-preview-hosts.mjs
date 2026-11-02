import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const registry = JSON.parse(
  readFileSync(
    new URL("../docs/evidence/deployment-hosts.json", import.meta.url),
    "utf8",
  ),
);
if (
  !existsSync(
    new URL("../docs/evidence/" + registry.retirementEvidence, import.meta.url),
  )
)
  throw new Error("Missing retirement evidence");

export function classifyHostResponse(host, status, location = "", body = "") {
  const retired = registry.retired.includes(host);
  const active = registry.activePreview.includes(host);
  if (!retired && !active) return "unverified";
  if (retired && status === 404 && body.includes("Site not found"))
    return "retired";
  if ([401, 403, 503].includes(status)) return "restricted";
  if (active && status === 302) {
    try {
      const target = new URL(location);
      if (
        target.origin === "https://vercel.com" &&
        target.pathname === "/sso-api"
      )
        return "restricted";
    } catch {
      /* Invalid redirects remain unverified. */
    }
  }
  return "unverified";
}

async function probe() {
  let failed = false;
  for (const host of [...registry.retired, ...registry.activePreview]) {
    try {
      const response = await fetch(`https://${host}/login`, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });
      const body =
        response.status === 404 ? (await response.text()).slice(0, 100000) : "";
      const result = classifyHostResponse(
        host,
        response.status,
        response.headers.get("location") ?? "",
        body,
      );
      await response.body?.cancel();
      console.log(`${result.toUpperCase()} ${host}: HTTP ${response.status}`);
      if (result === "unverified") failed = true;
    } catch {
      console.log(`UNVERIFIED ${host}: request failed`);
      failed = true;
    }
  }
  console.log(
    "Read-only access check only; this does not attest backend isolation or all historical deployments.",
  );
  if (failed) process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await probe();
