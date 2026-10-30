export const recoveryHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

export function validTokenHash(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,512}$/.test(value);
}

export function sameOriginPost(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const url = new URL(request.url);
  let expected = url.origin;
  const host = request.headers.get("host");
  if (host) {
    try {
      const external = new URL(`${url.protocol}//${host}`);
      if (
        external.username ||
        external.password ||
        external.pathname !== "/" ||
        external.search ||
        external.hash
      )
        return false;
      // Next start normalizes route URLs to localhost; preserve the browser's
      // exact loopback authority without trusting X-Forwarded-Host.
      const loopback = ["localhost", "127.0.0.1"];
      if (
        external.host === url.host ||
        (loopback.includes(url.hostname) &&
          loopback.includes(external.hostname) &&
          external.port === url.port)
      )
        expected = external.origin;
      else return false;
    } catch {
      return false;
    }
  }
  return (
    origin === expected && (!site || site === "same-origin" || site === "none")
  );
}

export function validPassword(
  password: unknown,
  confirmation: unknown,
): password is string {
  return (
    typeof password === "string" &&
    password === confirmation &&
    Array.from(password).length >= 12 &&
    new TextEncoder().encode(password).length <= 72
  );
}

export async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new Error("Body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
