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
  const buildings = await listBuildings(siteId, page);
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
