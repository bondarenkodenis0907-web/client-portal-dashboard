import { notFound } from "next/navigation";
import { facilityClient } from "./facility-directory";
import type { Database } from "./supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
export async function managementAccess(client: SupabaseClient<Database>) {
  const r = await client.rpc("can_manage_facilities");
  if (r.error)
    throw Error("Management access could not be checked. Please retry.");
  return r.data === true;
}
export async function requireFacilityManager() {
  const client = await facilityClient();
  if (!(await managementAccess(client))) notFound();
  return client;
}
export async function listContracts(siteId: string, page = 1) {
  const client = await facilityClient();
  const r = await client
    .rpc("contract_summaries", { p_site_id: siteId }, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 50, page * 50 - 1)
    .retry(false);
  if (r.error) throw Error("Contracts could not be loaded. Please retry.");
  return { items: r.data ?? [], total: r.count ?? 0 };
}
export async function getContract(siteId: string, id: string) {
  const client = await facilityClient();
  const r = await client
    .from("contracts")
    .select("id, site_id, revision, published_version_id")
    .eq("site_id", siteId)
    .eq("id", id)
    .maybeSingle()
    .retry(false);
  if (r.error) throw Error("Contract could not be loaded. Please retry.");
  return r.data;
}
export async function contractVersions(contractId: string, page = 1) {
  const client = await facilityClient();
  const offset = (page - 1) * 50;
  const r = await client
    .from("contract_versions")
    .select("*", { count: "exact" })
    .eq("contract_id", contractId)
    .order("version", { ascending: false })
    .range(offset, offset + 49)
    .retry(false);
  if (r.error) throw Error("Versions could not be loaded. Please retry.");
  return { items: r.data ?? [], total: r.count ?? 0 };
}
