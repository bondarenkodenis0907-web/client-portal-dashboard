import { notFound } from "next/navigation";
import { requireFacilityManager } from "@/lib/facility-management";
import { getSite, isFacilityId } from "@/lib/facility-directory";
import { SiteForm } from "@/components/portal/FacilityForms";
export default async function EditSite({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  await requireFacilityManager();
  const { siteId } = await params;
  if (!isFacilityId(siteId)) notFound();
  const site = await getSite(siteId);
  if (!site) notFound();
  return (
    <section>
      <h1 className="text-2xl font-semibold">Edit site</h1>
      <SiteForm
        key={`${site.id}-${site.version}`}
        id={site.id}
        revision={site.version}
        initial={site}
      />
    </section>
  );
}
