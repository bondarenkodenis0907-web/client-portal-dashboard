import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Vercel Preview currently uses the same Supabase configuration as Production.
  // Deny app routes before auth or database access until an isolated test DB exists.
  if (process.env.VERCEL_ENV === "preview") {
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
