import Link from "next/link";
import { notFound } from "next/navigation";
import { getBuilding, getSite, isFacilityId } from "@/lib/facility-directory";

export default async function BuildingPage({
  params,
}: {
  params: Promise<{ siteId: string; buildingId: string }>;
}) {
  const { siteId, buildingId } = await params;
  if (!isFacilityId(siteId) || !isFacilityId(buildingId)) notFound();
  const [site, building] = await Promise.all([
    getSite(siteId),
    getBuilding(siteId, buildingId),
  ]);
  if (!site || !building) notFound();
  return (
    <section>
      <nav
        aria-label="Building location"
        className="flex flex-wrap gap-2 text-sm text-blue-700"
      >
        <Link href="/dashboard/sites">Sites</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/dashboard/sites/${siteId}`} className="break-words">
          {site.name}
        </Link>
      </nav>
      <h1 className="mt-5 break-words text-2xl font-semibold tracking-tight text-slate-900">
        {building.name}
      </h1>
      <p className="mt-2 text-sm text-slate-500">Building information</p>
      <dl className="mt-7 grid gap-6 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-slate-500">Site</dt>
          <dd className="mt-1 break-words font-medium">{site.name}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">Building address</dt>
          <dd className="mt-1 break-words font-medium">
            {building.address || "Address not recorded"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
