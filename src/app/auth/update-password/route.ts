import { recoveryJson } from "@/lib/recovery-response";
import { recoveryClient } from "@/lib/recovery-server";
import { changeRecoveryPassword } from "@/lib/recovery-actions";
import { cookies } from "next/headers";
import { recoveryCookie } from "@/lib/recovery-grant";
import {
  boundedBody,
  sameOriginPost,
  validPassword,
} from "@/lib/recovery-policy";

export async function POST(request: Request) {
  if (!sameOriginPost(request)) return recoveryJson({ state: "rejected" }, 403);
  if (
    (request.headers.get("content-type") ?? "").split(";")[0].trim() !==
    "application/json"
  )
    return recoveryJson({ state: "rejected" }, 415);
  let form;
  try {
    form = JSON.parse(await boundedBody(request));
  } catch {
    return recoveryJson({ state: "rejected" }, 400);
  }
  if (!form || !validPassword(form.password, form.confirmation))
    return recoveryJson({ state: "invalid_password" }, 400);
  try {
    const supabase = await recoveryClient();
    if (!supabase) return recoveryJson({ state: "invalid_session" }, 401);
    const state = await changeRecoveryPassword(supabase.auth, form.password);
    if (state === "complete" || state === "updated_logout_pending")
      (await cookies()).delete(recoveryCookie);
    return recoveryJson(
      { state },
      state === "update_failed" ? 422 : state === "unknown" ? 503 : 200,
    );
  } catch {
    return recoveryJson({ state: "unknown" }, 503);
  }
}
