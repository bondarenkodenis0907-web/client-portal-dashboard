import { NextResponse, type NextRequest } from "next/server";
import { validTokenHash } from "@/lib/recovery-policy";

// Reading an email link must never consume its single-use recovery token.
// Automated mail scanners can follow GET redirects before the user arrives.
function sameOriginRedirect(location: string) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (
    type !== "recovery" ||
    request.nextUrl.searchParams.getAll("type").length !== 1 ||
    request.nextUrl.searchParams.getAll("token_hash").length !== 1 ||
    !validTokenHash(tokenHash)
  ) {
    return sameOriginRedirect("/forgot-password?status=invalid");
  }

  const query = new URLSearchParams({ token_hash: tokenHash });
  return sameOriginRedirect(`/auth/confirm?${query.toString()}`);
}
