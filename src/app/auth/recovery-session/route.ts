import { recoveryJson } from "@/lib/recovery-response";
import { recoveryClient } from "@/lib/recovery-server";

export async function GET() {
  try {
    return recoveryJson({ ready: Boolean(await recoveryClient()) });
  } catch {
    return recoveryJson({ ready: false }, 503);
  }
}
