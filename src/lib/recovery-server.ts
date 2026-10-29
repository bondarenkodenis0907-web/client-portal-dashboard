import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import {
  recoveryCookie,
  recoverySecret,
  verifyRecoveryGrant,
} from "@/lib/recovery-grant";

export async function recoveryClient() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims || typeof data.claims.session_id !== "string")
    return null;
  const user = await supabase.auth.getUser();
  if (user.error || !user.data.user || user.data.user.id !== data?.claims.sub)
    return null;
  if (
    !user.data.user.updated_at ||
    !verifyRecoveryGrant(
      (await cookies()).get(recoveryCookie)?.value,
      {
        sub: user.data.user.id,
        session_id: data.claims.session_id,
        userVersion: user.data.user.updated_at,
      },
      recoverySecret(),
    )
  )
    return null;
  return supabase;
}
