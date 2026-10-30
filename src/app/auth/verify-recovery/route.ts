import { NextResponse } from "next/server";
import { recoveryRedirect } from "@/lib/recovery-response";
import { createClient } from "@/lib/supabase/server";
import {
  issueRecoveryGrant,
  recoveryCookie,
  recoverySecret,
} from "@/lib/recovery-grant";
import {
  boundedBody,
  recoveryHeaders,
  sameOriginPost,
  validTokenHash,
} from "@/lib/recovery-policy";

function invalid() {
  return recoveryRedirect("/forgot-password?status=invalid");
}

export async function POST(request: Request) {
  if (!sameOriginPost(request))
    return new NextResponse("Confirmation rejected", {
      status: 403,
      headers: recoveryHeaders,
    });
  const contentType = (request.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded")
    return new NextResponse("Unsupported form", {
      status: 415,
      headers: recoveryHeaders,
    });
  let tokenHash: string | null;
  try {
    const form = new URLSearchParams(await boundedBody(request));
    tokenHash = form.get("token_hash");
    if (form.getAll("token_hash").length !== 1 || !validTokenHash(tokenHash))
      return invalid();
  } catch {
    return new NextResponse("Invalid form", {
      status: 400,
      headers: recoveryHeaders,
    });
  }
  try {
    const secret = recoverySecret(); // Fail before consuming the OTP if configuration is missing.
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    if (error || !data.session) return invalid();
    const claims = await supabase.auth.getClaims();
    const user = await supabase.auth.getUser();
    if (
      claims.error ||
      user.error ||
      !user.data.user?.updated_at ||
      typeof claims.data?.claims.session_id !== "string" ||
      claims.data.claims.sub !== user.data.user.id
    )
      return invalid();
    const response = recoveryRedirect("/reset-password");
    response.cookies.set(
      recoveryCookie,
      issueRecoveryGrant(
        {
          sub: user.data.user.id,
          session_id: claims.data.claims.session_id,
          userVersion: user.data.user.updated_at,
        },
        secret,
      ),
      {
        httpOnly: true,
        sameSite: "strict",
        secure:
          process.env.VERCEL === "1" ||
          new URL(request.url).protocol === "https:",
        path: "/",
        maxAge: 600,
      },
    );
    return response;
  } catch {
    return new NextResponse(
      "Unable to verify this link. Request a new link and try again.",
      { status: 503, headers: recoveryHeaders },
    );
  }
}
