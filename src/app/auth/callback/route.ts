import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  const destination = request.nextUrl.clone();
  destination.pathname = "/reset-password";
  destination.search = "";
  destination.hash = "";

  if (tokenHash && type === "recovery") {
    // Next.js Route Handlers can persist server Auth cookies via cookies().
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    if (!error && data.session) {
      return NextResponse.redirect(destination, {
        status: 303,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
  }

  const retry = request.nextUrl.clone();
  retry.pathname = "/forgot-password";
  retry.search = "?status=invalid";
  retry.hash = "";
  return NextResponse.redirect(retry, {
    status: 303,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
