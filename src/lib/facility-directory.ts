import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { isTransientAuthError } from "./auth-errors";

export const facilityPageSize = 50;
export const isFacilityId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// One-based URLs; bounded integer offsets, never interpolated into SQL.
export function facilityPage(value: string | string[] | undefined) {
  return typeof value === "string" && /^[1-9]\d{0,5}$/.test(value)
    ? Number(value)
    : 1;
}

export const facilityClient = cache(async () => {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (isTransientAuthError(error))
    throw new Error("Authentication is temporarily unavailable. Please retry.");
  if (error || !data.user) redirect("/login");
  return client;
});

export async function listSites(page: number) {
  const client = await facilityClient();
  const offset = (page - 1) * facilityPageSize;
  const result = await client
    .from("sites")
    .select("id, name, address", { count: "exact" })
    .order("name")
    .order("id")
    .range(offset, offset + facilityPageSize - 1)
    .retry(false);
  if (result.error) throw new Error("Sites could not be loaded. Please retry.");
  return { items: result.data ?? [], total: result.count ?? 0 };
}

export async function getSite(id: string) {
  const client = await facilityClient();
  const result = await client
    .from("sites")
    .select("id, name, address")
    .eq("id", id)
    .maybeSingle()
    .retry(false);
  if (result.error)
    throw new Error("The site could not be loaded. Please retry.");
  return result.data;
}

export async function listBuildings(siteId: string, page: number) {
  const client = await facilityClient();
  const offset = (page - 1) * facilityPageSize;
  const result = await client
    .from("buildings")
    .select("id, site_id, name, address", { count: "exact" })
    .eq("site_id", siteId)
    .order("name")
    .order("id")
    .range(offset, offset + facilityPageSize - 1)
    .retry(false);
  if (result.error)
    throw new Error("Buildings could not be loaded. Please retry.");
  return { items: result.data ?? [], total: result.count ?? 0 };
}

export async function getBuilding(siteId: string, buildingId: string) {
  const client = await facilityClient();
  const result = await client
    .from("buildings")
    .select("id, site_id, name, address")
    .eq("site_id", siteId)
    .eq("id", buildingId)
    .maybeSingle()
    .retry(false);
  if (result.error)
    throw new Error("The building could not be loaded. Please retry.");
  return result.data;
}
