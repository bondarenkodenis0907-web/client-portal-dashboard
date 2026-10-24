import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function redirect(location: string) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function POST(request: NextRequest) {
  // The confirmation must come from a user submitting our same-origin form.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return new NextResponse("Cross-site confirmation rejected", {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (
    !contentType.startsWith("application/x-www-form-urlencoded") &&
    !contentType.startsWith("multipart/form-data")
  ) {
    return new NextResponse("Unsupported form", {
      status: 415,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const form = await request.formData();
  const tokenHash = form.get("token_hash");
  if (
    typeof tokenHash !== "string" ||
    !/^[A-Za-z0-9_-]{20,512}$/.test(tokenHash)
  ) {
    return redirect("/forgot-password?status=invalid");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });
  if (error || !data.session) {
    return redirect("/forgot-password?status=invalid");
  }

  return redirect("/reset-password");
}
