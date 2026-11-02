import Link from "next/link";
import { managementAccess } from "@/lib/facility-management";
import { facilityClient } from "@/lib/facility-directory";
import {
  DirectoryCard,
  DirectoryPages,
} from "@/components/portal/FacilityDirectory";
import { facilityPage, listSites } from "@/lib/facility-directory";

export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const page = facilityPage((await searchParams).page);
  const [sites, manager] = await Promise.all([
    listSites(page),
    managementAccess(await facilityClient()),
  ]);
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Sites
      </h1>
      <p className="mb-7 mt-2 text-sm text-slate-500">
        Open a site to view its buildings.
      </p>
      {manager && (
        <Link
          href="/dashboard/sites/new"
          className="mb-5 inline-block rounded-lg bg-blue-700 px-4 py-2 text-sm text-white"
        >
          New site
        </Link>
      )}
      {sites.items.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {sites.items.map((site) => (
            <DirectoryCard
              key={site.id}
              {...site}
              href={`/dashboard/sites/${site.id}`}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-7">
          <h2 className="font-semibold">
            {sites.total ? "No sites on this page" : "No sites available"}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {sites.total
              ? "Return to an earlier page to view sites."
              : "Your service contact can arrange access to the sites you work with."}
          </p>
        </div>
      )}
      <DirectoryPages path="/dashboard/sites" page={page} total={sites.total} />
    </section>
  );
}
