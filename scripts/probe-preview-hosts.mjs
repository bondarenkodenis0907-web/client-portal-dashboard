// Read-only checks against known hosting URLs, with NO tokens, cookies or POSTs.
// This cannot verify the provider's environment variables or historic deployments.
const names = [
  "client-portal-dashboard.netlify.app",
  "ornate-daffodil-920c83.netlify.app",
  "deploy-preview-22--client-portal-dashboard.netlify.app",
  "deploy-preview-22--ornate-daffodil-920c83.netlify.app",
  "client-portal-dashboard-git-chor-c3c9a6-bondarenkodenis0907-web.vercel.app",
];
let failed = false;
for (const name of names) {
  try {
    const response = await fetch(`https://${name}/login`, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": "ClientPortal-ReadOnly-Preview-Safety-Audit" },
      signal: AbortSignal.timeout(10_000),
    });
    const safe = [401, 403, 503].includes(response.status);
    console.log(
      `${safe ? "PASS" : "UNVERIFIED"} ${name}: HTTP ${response.status}`,
    );
    if (!safe) failed = true;
    await response.body?.cancel();
  } catch (error) {
    console.log(
      `UNVERIFIED ${name}: ${error instanceof Error ? error.name : "FetchError"}`,
    );
    failed = true;
  }
}
if (failed) {
  console.error("Deployment access review blocked: see statuses above.");
  process.exitCode = 1;
}
