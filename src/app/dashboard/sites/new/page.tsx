import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireFacilityManager } from "@/lib/facility-management";
import { getSite, isFacilityId } from "@/lib/facility-directory";
import { SiteForm } from "@/components/portal/FacilityForms";
export default async function NewSite({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string | string[] }>;
}) {
  await requireFacilityManager();
  const { draft } = await searchParams;
  if (typeof draft !== "string" || !isFacilityId(draft))
    redirect("/dashboard/sites/new?draft=" + randomUUID());
  if (await getSite(draft)) redirect(`/dashboard/sites/${draft}/edit`);
  return (
    <section>
      <h1 className="text-2xl font-semibold">New site</h1>
      <SiteForm
        key={draft}
        id={draft}
        revision={0}
        initial={{
          name: "",
          address: "",
          customer_name: "",
          contact_name: "",
          contact_email: "",
          contact_phone: "",
          is_archived: false,
        }}
      />
    </section>
  );
}
