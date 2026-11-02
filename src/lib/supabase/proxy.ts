import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isTransientAuthError } from "@/lib/auth-errors";
import type { Database } from "./database.types";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([name, value]) =>
            response.headers.set(name, value),
          );
        },
      },
    },
  );

  function sessionResponse(next: NextResponse) {
    response.cookies.getAll().forEach((cookie) => next.cookies.set(cookie));
    for (const name of ["Cache-Control", "Expires", "Pragma"]) {
      const value = response.headers.get(name);
      if (value) next.headers.set(name, value);
    }
    return next;
  }
  function unavailable() {
    return sessionResponse(
      new NextResponse(
        "Authentication is temporarily unavailable. Please try again.",
        {
          status: 503,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": "5",
          },
        },
      ),
    );
  }

  let authenticated = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    // Auth also returns 400 for an explicitly rejected refresh token/JWT.
    // Temporary failures must not redirect or discard a rotated session.
    if (error && error.status !== 400 && isTransientAuthError(error))
      return unavailable();
    authenticated = !error && Boolean(data?.claims);
  } catch {
    return unavailable();
  }
  response.headers.set("Cache-Control", "private, no-store");

  if (!authenticated && request.nextUrl.pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";

    return sessionResponse(NextResponse.redirect(url));
  }

  return response;
}
