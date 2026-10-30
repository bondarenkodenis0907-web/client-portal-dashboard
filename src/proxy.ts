import { NextResponse, type NextRequest } from "next/server";
import { isDeploymentAllowed } from "@/lib/deployment-guard";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (!isDeploymentAllowed(request.nextUrl.hostname, process.env)) {
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
  if (process.env.CLIENT_PORTAL_MAINTENANCE === "1") {
    return new NextResponse(
      "Portal temporarily unavailable. Please try again later.",
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Content-Type": "text/plain; charset=utf-8",
          "Retry-After": "60",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  }
  // Guard assets too; only approved environments may skip Auth on static paths.
  const path = request.nextUrl.pathname;
  if (
    [
      "/auth/callback",
      "/auth/confirm",
      "/auth/verify-recovery",
      "/auth/recovery-session",
      "/auth/update-password",
      "/auth/finish-recovery",
      "/reset-password",
      "/forgot-password",
    ].includes(path)
  )
    return NextResponse.next();
  if (
    path.startsWith("/_next/static/") ||
    path === "/_next/image" ||
    path === "/favicon.ico" ||
    path === "/icon.svg" ||
    path.startsWith("/screenshots/")
  ) {
    return NextResponse.next();
  }
  return updateSession(request);
}

export const config = {
  matcher: "/:path*",
};
