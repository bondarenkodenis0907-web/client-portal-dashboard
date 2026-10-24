// Read only publicly served HTML/JS. Do not display source, keys or URLs.
// This is an exposure indicator, not a replacement for Netlify env inspection.
const base = "https://client-portal-dashboard.netlify.app";
const knownPortalProjectRef = "xdpewqewdeiaoyotpawv";
const response = await fetch(base + "/login", {
  method: "GET",
  redirect: "manual",
  signal: AbortSignal.timeout(10_000),
});
if (response.status !== 200) {
  console.log(
    `Public Netlify fingerprint not applicable: HTTP ${response.status}`,
  );
  process.exit(0);
}
const html = await response.text();
let foundProjectRef = html.includes(knownPortalProjectRef);
let foundAnySupabaseEndpoint = html.includes(".supabase.co");
const sources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((path) => path.startsWith("/_next/") && path.includes(".js"))
  .slice(0, 30);
let inspected = 0;
for (const path of sources) {
  try {
    const js = await fetch(base + path, {
      method: "GET",
      signal: AbortSignal.timeout(7_000),
    });
    const length = Number(js.headers.get("content-length") || 0);
    if (!js.ok || length > 5_000_000) {
      await js.body?.cancel();
      continue;
    }
    const body = await js.text();
    inspected++;
    foundProjectRef ||= body.includes(knownPortalProjectRef);
    foundAnySupabaseEndpoint ||= body.includes(".supabase.co");
  } catch {
    // An unreachable asset is inconclusive; never claim an isolated backend.
  }
}
console.log(
  "Public Netlify frontend: HTTP 200; inspected JS assets: " + inspected,
);
console.log(
  "Contains known Client Portal Supabase project reference: " +
    (foundProjectRef ? "YES" : "NOT DETECTED"),
);
console.log(
  "Contains any Supabase endpoint string: " +
    (foundAnySupabaseEndpoint ? "YES" : "NOT DETECTED"),
);
console.log(
  "A NOT DETECTED result does not prove backend isolation or absence of secrets.",
);
