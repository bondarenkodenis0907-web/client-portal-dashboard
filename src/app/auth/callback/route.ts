import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = request.nextUrl.clone();
      destination.pathname = "/reset-password";
      destination.search = "";
      return NextResponse.redirect(destination);
    }
  }

  // Never forward arbitrary URLs or auth tokens from the callback query.
  const destination = request.nextUrl.clone();
  destination.pathname = "/forgot-password";
  destination.search = "?status=invalid";
  return NextResponse.redirect(destination);
}
