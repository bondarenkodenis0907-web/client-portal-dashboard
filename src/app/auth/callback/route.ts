import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function sameOriginRedirect(location: string) {
  // Relative Location preserves the browser's actual hostname, including
  // localhost vs. 127.0.0.1. Never derive a redirect from a forwarded Host.
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (tokenHash && type === "recovery") {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    if (!error && data.session) {
      return sameOriginRedirect("/reset-password");
    }
  }

  return sameOriginRedirect("/forgot-password?status=invalid");
}
