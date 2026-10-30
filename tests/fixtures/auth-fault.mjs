import { existsSync, readFileSync } from "node:fs";

// Loaded explicitly only by the isolated integration-test server.
if (
  process.env.CLIENT_PORTAL_LOCAL_TESTS !== "1" ||
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:56321" ||
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.NETLIFY ||
  process.env.CONTEXT
)
  throw Error("Auth fault injection requires the dedicated local backend");
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input.url || String(input),
  );
  const marker = process.env.TEST_AUTH_FAULT_FILE;
  if (
    url.origin === "http://127.0.0.1:56321" &&
    url.pathname === "/auth/v1/user" &&
    marker &&
    existsSync(marker)
  ) {
    const status = Number(readFileSync(marker, "utf8"));
    if (![401, 403, 503].includes(status))
      throw Error("Invalid synthetic Auth status");
    return new Response(
      JSON.stringify({
        code: "unexpected_failure",
        msg: "Synthetic Auth failure",
      }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  return original(input, init);
};
