import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Only approved Vercel Production may access the hosted backend.
  // Public deployments on other providers have no verified staging database,
  // so reject them even if their provider-specific env vars are unavailable
  // at runtime. The loopback exception is for local development/CI only.
  const hostname = request.nextUrl.hostname.toLowerCase();
  const isLoopback = hostname === "localhost" || hostname === "127.0.0.1";
  const localOnly =
    isLoopback &&
    !process.env.VERCEL_ENV &&
    (process.env.NODE_ENV === "development" ||
      process.env.CLIENT_PORTAL_LOCAL_TESTS === "1");
  const approvedProduction = process.env.VERCEL_ENV === "production";
  const unsafePreview = !approvedProduction && !localOnly;

  if (unsafePreview) {
    return new NextResponse(
      "Preview unavailable until an isolated test database is configured.",
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
