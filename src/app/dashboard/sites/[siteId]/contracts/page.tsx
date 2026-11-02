import Link from "next/link";
import { notFound } from "next/navigation";
import {
  facilityClient,
  facilityPage,
  getSite,
  isFacilityId,
} from "@/lib/facility-directory";
import { listContracts, managementAccess } from "@/lib/facility-management";
import { DirectoryPages } from "@/components/portal/FacilityDirectory";
export default async function Contracts({
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
  const [contracts, manager] = await Promise.all([
    listContracts(siteId, page),
    managementAccess(await facilityClient()),
  ]);
  return (
    <section>
      <Link
        href={`/dashboard/sites/${siteId}`}
        className="text-sm text-blue-700"
      >
        {site.name}
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Contracts</h1>
        {manager && !site.is_archived && (
          <Link
            href={`/dashboard/sites/${siteId}/contracts/new`}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white"
          >
            New contract
          </Link>
        )}
      </div>
      <div className="mt-6 space-y-3">
        {contracts.items.map((c) => (
          <Link
            key={c.id}
            href={`/dashboard/sites/${siteId}/contracts/${c.id}`}
            className="block rounded-xl border border-slate-200 bg-white p-5"
          >
            <span className="block break-words font-semibold">{c.title}</span>
            <span className="mt-1 block text-sm text-slate-500">
              {c.contract_number} ·{" "}
              {c.published_version_id
                ? "Published version available"
                : "Internal"}
            </span>
          </Link>
        ))}
        {!contracts.items.length && (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            {contracts.total
              ? "No contracts on this page."
              : "No contracts available."}
          </p>
        )}
      </div>
      <DirectoryPages
        path={`/dashboard/sites/${siteId}/contracts`}
        page={page}
        total={contracts.total}
      />
    </section>
  );
}
