import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import {
  requestColumns,
  parseServiceRequest,
  type RequestStatus,
} from "./requests";

export const requestPageSize = 50;
export const requestSearchLimit = 200;

export async function getRequestPage(
  client: SupabaseClient<Database>,
  options: {
    page: number;
    search: string;
    status: RequestStatus | "all" | "open";
    userId?: string;
  },
  signal?: AbortSignal,
) {
  const from = Math.max(0, Math.floor(options.page)) * requestPageSize;
  let query = client
    .from("service_requests")
    .select(requestColumns, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + requestPageSize - 1)
    .retry(false);
  if (options.userId) query = query.eq("user_id", options.userId);
  if (options.status === "open") query = query.neq("status", "closed");
  else if (options.status !== "all") query = query.eq("status", options.status);
  const search = options.search.trim().slice(0, requestSearchLimit);
  if (search) {
    // Literal, case-insensitive regex avoids PostgREST's '*' alias for LIKE.
    const pattern = JSON.stringify(
      search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    query = query.or(
      ["site", "system", "description"]
        .map((column) => `${column}.imatch.${pattern}`)
        .join(","),
    );
  }
  if (signal) query = query.abortSignal(signal);
  const result = await query;
  if (result.error) throw result.error;
  return {
    requests: (result.data ?? []).map(parseServiceRequest),
    total: result.count ?? 0,
  };
}
