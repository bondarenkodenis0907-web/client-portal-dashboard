import { recoveryJson } from "@/lib/recovery-response";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { recoveryCookie } from "@/lib/recovery-grant";
import { finishRecoverySignOut } from "@/lib/recovery-actions";
import { sameOriginPost } from "@/lib/recovery-policy";

export async function POST(request: Request) {
  if (!sameOriginPost(request)) return recoveryJson({ complete: false }, 403);
  try {
    const supabase = await createClient();
    const complete = await finishRecoverySignOut(supabase.auth);
    if (complete) (await cookies()).delete(recoveryCookie);
    return recoveryJson({ complete }, complete ? 200 : 503);
  } catch {
    return recoveryJson({ complete: false }, 503);
  }
}
