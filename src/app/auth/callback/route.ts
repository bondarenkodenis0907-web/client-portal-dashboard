import { NextResponse, type NextRequest } from "next/server";

export function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const destination = request.nextUrl.clone();

  if (code) {
    // Keep the one-time PKCE code on this origin. The browser client that
    // initiated recovery will exchange it using its own code verifier.
    destination.pathname = "/reset-password";
    destination.search = "";
    destination.searchParams.set("code", code);
    return NextResponse.redirect(destination, {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }

  // Ignore untrusted redirect parameters and invalid/expired recovery links.
  destination.pathname = "/forgot-password";
  destination.search = "?status=invalid";
  return NextResponse.redirect(destination, {
    headers: { "Cache-Control": "no-store" },
  });
}
