import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Preview is unsafe until every hosting provider has a separate backend.
  // Vercel and Netlify builds may otherwise use Production Supabase credentials.
  // Netlify is not an approved Production host for this project: fail closed
  // there regardless of its deployment context, before refreshing Auth cookies.
  const hostname = request.nextUrl.hostname.toLowerCase();
  const netlifyHost =
    hostname === "netlify.app" || hostname.endsWith(".netlify.app");
  const unsafePreview =
    process.env.VERCEL_ENV === "preview" ||
    process.env.NETLIFY === "true" ||
    process.env.CONTEXT === "deploy-preview" ||
    process.env.CONTEXT === "branch-deploy" ||
    netlifyHost;

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
