import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import {
  requireFacilityManager,
  getContract,
  contractVersions,
} from "@/lib/facility-management";
import { getSite, isFacilityId } from "@/lib/facility-directory";
import { contractDetails, type ContractDetails } from "@/lib/contract-policy";
import { ContractForm } from "./FacilityForms";
export async function ContractEditorPage({
  siteId,
  contractId,
  draft,
}: {
  siteId: string;
  contractId?: string;
  draft?: string | string[];
}) {
  const client = await requireFacilityManager();
  if (!isFacilityId(siteId) || (contractId && !isFacilityId(contractId)))
    notFound();
  const site = await getSite(siteId);
  if (!site) notFound();
  const base = `/dashboard/sites/${siteId}/contracts/${contractId ? contractId + "/new-version" : "new"}`;
  if (typeof draft !== "string" || !isFacilityId(draft))
    redirect(base + "?draft=" + randomUUID());
  const id = contractId ?? draft;
  const contract = await getContract(siteId, id);
  if (contractId && !contract) notFound();
  if (!contractId && contract)
    redirect(`/dashboard/sites/${siteId}/contracts/${id}`);
  const existing = await client
    .from("contract_versions")
    .select("id")
    .eq("id", draft)
    .maybeSingle();
  if (existing.error) throw Error("Could not check the saved operation.");
  if (existing.data) redirect(`/dashboard/sites/${siteId}/contracts/${id}`);
  const versions = contract ? await contractVersions(id) : null;
  const initial: ContractDetails = versions?.items[0]
    ? contractDetails(versions.items[0].details)
    : {
        number: "",
        title: "",
        customer: site.customer_name,
        provider: "",
        starts_on: "",
        ends_on: "",
        state: "draft",
        responsible_id: "",
        notes: "",
      };
  const staff = await client
    .from("service_staff")
    .select("user_id,display_name")
    .eq("is_active", true)
    .order("display_name");
  if (staff.error) throw Error("Staff could not be loaded.");
  return (
    <section>
      <h1 className="text-2xl font-semibold">
        {contract ? "New contract version" : "New contract"}
      </h1>
      <p className="mt-2 text-sm text-slate-500">{site.name}</p>
      <ContractForm
        key={`${draft}-${contract?.revision ?? 0}`}
        id={id}
        siteId={siteId}
        versionId={draft}
        revision={contract?.revision ?? 0}
        initial={initial}
        staff={staff.data ?? []}
      />
    </section>
  );
}
