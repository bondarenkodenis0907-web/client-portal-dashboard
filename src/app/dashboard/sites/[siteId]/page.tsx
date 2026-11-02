import { managementAccess } from "@/lib/facility-management";
import { facilityClient } from "@/lib/facility-directory";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DirectoryCard,
  DirectoryPages,
} from "@/components/portal/FacilityDirectory";
import {
  facilityPage,
  getSite,
  isFacilityId,
  listBuildings,
} from "@/lib/facility-directory";

export default async function SitePage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { siteId } = await params;
  if (!isFacilityId(siteId)) notFound();
  const site = await getSite(siteId);
  if (!site) notFound();
  const page = facilityPage((await searchParams).page);
  const [buildings, manager] = await Promise.all([
    listBuildings(siteId, page),
    managementAccess(await facilityClient()),
  ]);
  return (
    <section>
      <Link
        href="/dashboard/sites"
        className="text-sm font-medium text-blue-700"
      >
        All sites
      </Link>
      <h1 className="mt-4 break-words text-2xl font-semibold tracking-tight text-slate-900">
        {site.name}
      </h1>
      <p className="mt-2 break-words text-sm text-slate-500">
        {site.address || "Address not recorded"}
      </p>
      <dl className="mt-5 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 text-sm sm:grid-cols-2">
        {[
          ["Customer", site.customer_name],
          ["Contact", site.contact_name],
          ["Email", site.contact_email],
          ["Phone", site.contact_phone],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-slate-500">{label}</dt>
            <dd className="mt-1 break-words">{value || "Not recorded"}</dd>
          </div>
        ))}
      </dl>
      {site.is_archived && (
        <p className="mt-3 text-sm text-slate-500">
          Archived — service history retained
        </p>
      )}
      <div className="mt-5 flex gap-5 text-sm font-medium text-blue-700">
        <Link href={`/dashboard/sites/${siteId}/contracts`}>Contracts</Link>
        {manager && (
          <Link href={`/dashboard/sites/${siteId}/edit`}>Edit site</Link>
        )}
      </div>
      <h2 className="mb-4 mt-8 text-lg font-semibold">Buildings</h2>
      {buildings.items.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {buildings.items.map((building) => (
            <DirectoryCard
              key={building.id}
              {...building}
              href={`/dashboard/sites/${siteId}/buildings/${building.id}`}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-7 text-sm text-slate-500">
          {buildings.total
            ? "No buildings on this page."
            : "No buildings recorded for this site yet."}
        </p>
      )}
      <DirectoryPages
        path={`/dashboard/sites/${siteId}`}
        page={page}
        total={buildings.total}
      />
    </section>
  );
}
