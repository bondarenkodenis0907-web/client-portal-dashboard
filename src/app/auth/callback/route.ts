import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/reset-password";
    destination.search = "";

    // Write Auth cookies on the actual redirect response. In Next.js route
    // handlers this avoids losing the recovered session at the redirect.
    const response = NextResponse.redirect(destination, {
      headers: { "Cache-Control": "no-store" },
    });
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return response;
  }

  // Never use an externally supplied redirect or forward code/token parameters.
  const destination = request.nextUrl.clone();
  destination.pathname = "/forgot-password";
  destination.search = "?status=invalid";
  return NextResponse.redirect(destination, {
    headers: { "Cache-Control": "no-store" },
  });
}
