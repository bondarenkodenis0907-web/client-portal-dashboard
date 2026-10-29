const productionHost = "client-portal-dashboard-one.vercel.app";
const productionBackend = "https://xdpewqewdeiaoyotpawv.supabase.co";
const testBackend = "http://127.0.0.1:56321";

function backendOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isDeploymentAllowed(
  hostname: string,
  env: Record<string, string | undefined>,
) {
  const host = hostname.toLowerCase();
  const backend = backendOrigin(env.NEXT_PUBLIC_SUPABASE_URL);
  const netlify =
    host === "netlify.app" ||
    host.endsWith(".netlify.app") ||
    Boolean(env.NETLIFY || env.CONTEXT);
  if (netlify || !backend) return false;
  if (env.VERCEL_ENV === "production") {
    return (
      env.VERCEL === "1" &&
      host === productionHost &&
      backend === productionBackend
    );
  }
  // A loopback Host header must not turn a cloud deployment into a local one.
  if (env.VERCEL || env.VERCEL_ENV) return false;
  if (host !== "localhost" && host !== "127.0.0.1") return false;
  if (env.NODE_ENV === "development") {
    const url = new URL(backend);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    );
  }
  return env.CLIENT_PORTAL_LOCAL_TESTS === "1" && backend === testBackend;
}
