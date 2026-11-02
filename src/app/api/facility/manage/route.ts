import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sameOriginPost } from "@/lib/recovery-policy";
import { isFacilityId } from "@/lib/facility-directory";
import { isTransientAuthError } from "@/lib/auth-errors";
import { managementAccess } from "@/lib/facility-management";
import {
  contractLimits,
  siteLimits,
  validFields,
  record,
  validRevision,
  validContractPdf,
  managementBody,
} from "@/lib/contract-policy";
import type { Json } from "@/lib/supabase/database.types";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
function reply(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers });
}
export async function POST(request: Request) {
  if (!sameOriginPost(request)) return reply("Request not allowed.", 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return reply("JSON required.", 415);
  const client = await createClient();
  const auth = await client.auth.getUser();
  if (isTransientAuthError(auth.error))
    return reply("Authentication unavailable. Save is not confirmed.", 503);
  if (auth.error || !auth.data.user)
    return reply("Sign in and reload before saving.", 401);
  try {
    if (!(await managementAccess(client)))
      return reply("Management admission required.", 403);
  } catch {
    return reply("Access could not be checked. Save is not confirmed.", 503);
  }
  let body: unknown;
  try {
    body = await managementBody(request);
  } catch {
    return reply("Invalid or oversized form.", 413);
  }
  if (
    !record(body) ||
    typeof body.id !== "string" ||
    !isFacilityId(body.id) ||
    !validRevision(body.revision)
  )
    return reply("Invalid form.", 422);
  let result;
  if (body.action === "site") {
    if (
      !validFields(body.details, siteLimits) ||
      !record(body.details) ||
      typeof body.details.is_archived !== "boolean"
    )
      return reply("Check the site fields.", 422);
    result = await client.rpc("save_site", {
      p_id: body.id,
      p_expected_version: body.revision,
      p_details: body.details as Json,
    });
  } else if (body.action === "contract") {
    if (
      typeof body.site_id !== "string" ||
      !isFacilityId(body.site_id) ||
      typeof body.version_id !== "string" ||
      !isFacilityId(body.version_id) ||
      !validFields(body.details, contractLimits) ||
      typeof body.filename !== "string" ||
      typeof body.pdf_base64 !== "string"
    )
      return reply("Check the contract fields.", 422);
    const bytes = Buffer.from(body.pdf_base64, "base64");
    if (!validContractPdf(body.filename, bytes))
      return reply("Choose a PDF up to 2 MiB.", 422);
    result = await client.rpc("save_contract_version", {
      p_contract_id: body.id,
      p_site_id: body.site_id,
      p_version_id: body.version_id,
      p_expected_revision: body.revision,
      p_details: body.details as Json,
      p_filename: body.filename,
      p_pdf_base64: body.pdf_base64,
    });
  } else if (body.action === "publish") {
    if (
      body.version_id !== null &&
      (typeof body.version_id !== "string" || !isFacilityId(body.version_id))
    )
      return reply("Invalid version.", 422);
    result = await client.rpc("publish_contract", {
      p_contract_id: body.id,
      p_expected_revision: body.revision,
      p_version_id: body.version_id as string | null,
    });
  } else return reply("Invalid action.", 422);
  if (result.error) {
    const code = result.error.code;
    return reply(
      code === "PT409"
        ? "Saved details changed. Reload before saving."
        : code === "42501"
          ? "Management admission required."
          : code === "PT503"
            ? "Service is under maintenance. Save is not confirmed."
            : code.startsWith("22") || code.startsWith("23")
              ? "Check the fields and PDF."
              : "Save result is not confirmed. Reload saved details before retrying.",
      code === "PT409"
        ? 409
        : code === "42501"
          ? 403
          : code === "PT503"
            ? 503
            : code.startsWith("22") || code.startsWith("23")
              ? 422
              : 503,
    );
  }
  if (
    !record(result.data) ||
    result.data.id !== body.id ||
    !validRevision(result.data.revision) ||
    result.data.revision < 1
  )
    return reply("Save result is not confirmed.", 503);
  return NextResponse.json({ saved: true, result: result.data }, { headers });
}
