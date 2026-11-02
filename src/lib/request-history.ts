import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { parseRequestEvent, type RequestEvent } from "./requests";

export type RequestHistoryPage = { events: RequestEvent[]; hasMore: boolean };
export const historyPageSize = 50;

export async function getRequestHistoryPage(
  client: SupabaseClient<Database>,
  requestId: string,
  before?: number,
  signal?: AbortSignal,
): Promise<RequestHistoryPage> {
  let query = client
    .from("request_events")
    .select("id, status, assigned_name, resolution, created_at")
    .eq("request_id", requestId)
    .order("id", { ascending: false })
    .limit(historyPageSize + 1)
    .retry(false);
  if (before !== undefined) query = query.lt("id", before);
  if (signal) query = query.abortSignal(signal);
  const result = await query;
  if (result.error) throw result.error;
  return {
    events: result.data.slice(0, historyPageSize).map(parseRequestEvent),
    hasMore: result.data.length > historyPageSize,
  };
}
