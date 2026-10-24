import { NextResponse, type NextRequest } from "next/server";

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
    !tokenHash ||
    !/^[A-Za-z0-9_-]{20,512}$/.test(tokenHash)
  ) {
    return sameOriginRedirect("/forgot-password?status=invalid");
  }

  const query = new URLSearchParams({ token_hash: tokenHash });
  return sameOriginRedirect(`/auth/confirm?${query.toString()}`);
}
