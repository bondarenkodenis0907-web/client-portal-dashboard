import { isTransientAuthError } from "@/lib/auth-errors";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isFacilityId } from "@/lib/facility-directory";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "sandbox; default-src 'none'",
  "X-Robots-Tag": "noindex, nofollow",
};
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { versionId } = await params;
  if (!isFacilityId(versionId))
    return new Response("Not available", { status: 404, headers });
  const client = await createClient();
  const auth = await client.auth.getUser();
  if (isTransientAuthError(auth.error))
    return new Response("Authentication unavailable. Please retry.", {
      status: 503,
      headers,
    });
  if (auth.error || !auth.data.user)
    return new Response("Not available", { status: 401, headers });
  const r = await client
    .rpc("download_contract_file", { p_version_id: versionId })
    .retry(false);
  if (r.error)
    return new Response("File could not be loaded. Please retry.", {
      status: 503,
      headers,
    });
  const file = r.data?.[0];
  if (!file) return new Response("Not available", { status: 404, headers });
  const bytes = Buffer.from(file.pdf_base64, "base64");
  if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
    return new Response("File integrity check failed.", {
      status: 503,
      headers,
    });
  return new Response(new Uint8Array(bytes), {
    headers: {
      ...headers,
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="contract.pdf"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
    },
  });
}
