import { NextResponse } from "next/server";
import { recoveryHeaders } from "./recovery-policy";

export function recoveryJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: recoveryHeaders });
}

export function recoveryRedirect(location: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { ...recoveryHeaders, Location: location },
  });
}
