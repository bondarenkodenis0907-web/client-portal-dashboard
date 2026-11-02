import Link from "next/link";
import { notFound } from "next/navigation";
import {
  facilityClient,
  facilityPage,
  getSite,
  isFacilityId,
} from "@/lib/facility-directory";
import {
  getContract,
  contractVersions,
  managementAccess,
} from "@/lib/facility-management";
import { contractDetails } from "@/lib/contract-policy";
import { DirectoryPages } from "@/components/portal/FacilityDirectory";
import { PublishVersion } from "@/components/portal/FacilityForms";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string; contractId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { siteId, contractId } = await params;
  if (!isFacilityId(siteId) || !isFacilityId(contractId)) notFound();
  const [site, contract] = await Promise.all([
    getSite(siteId),
    getContract(siteId, contractId),
  ]);
  if (!site || !contract) notFound();
  const page = facilityPage((await searchParams).page);
  const [versions, manager] = await Promise.all([
    contractVersions(contractId, page),
    managementAccess(await facilityClient()),
  ]);
  return (
    <section>
      <Link
        href={`/dashboard/sites/${siteId}/contracts`}
        className="text-sm text-blue-700"
      >
        {site.name} · Contracts
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Contract versions</h1>
        {manager && (
          <Link
            href={`/dashboard/sites/${siteId}/contracts/${contractId}/new-version`}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white"
          >
            New version
          </Link>
        )}
      </div>
      {manager && contract.published_version_id && (
        <PublishVersion
          key={`remove-${contract.revision}`}
          id={contractId}
          revision={contract.revision}
          versionId={null}
          label="Remove client publication"
        />
      )}
      <div className="mt-6 space-y-5">
        {versions.items.map((v) => {
          const d = contractDetails(v.details);
          return (
            <article
              key={v.id}
              className="rounded-xl border border-slate-200 bg-white p-6"
            >
              <p className="text-xs font-semibold text-slate-500">
                Version {v.version} ·{" "}
                {contract.published_version_id === v.id
                  ? "Published to site clients"
                  : "Internal"}
              </p>
              <h2 className="mt-2 break-words text-xl font-semibold">
                {d.title}
              </h2>
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                {[
                  ["Number", d.number],
                  ["Customer", d.customer],
                  ["Service provider", d.provider],
                  ["Status", d.state],
                  ["Starts on", d.starts_on],
                  ["Ends on", d.ends_on || "Not specified"],
                  ["Responsible staff", d.responsible_name],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="mt-1 break-words font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              {d.notes && (
                <p className="mt-5 whitespace-pre-wrap break-words text-sm text-slate-600">
                  {d.notes}
                </p>
              )}
              <a
                href={`/api/facility/files/${v.id}`}
                className="mt-5 inline-block break-all text-sm font-semibold text-blue-700"
              >
                Download {v.filename}
              </a>
              <p className="mt-1 text-xs text-slate-500">
                {v.byte_size} bytes · recorded {v.created_at.slice(0, 10)} ·{" "}
                {d.author_name}
              </p>
              {manager && contract.published_version_id !== v.id && (
                <PublishVersion
                  key={`${v.id}-${contract.revision}`}
                  id={contractId}
                  revision={contract.revision}
                  versionId={v.id}
                  label={`Publish version ${v.version}`}
                />
              )}
            </article>
          );
        })}
      </div>
      <DirectoryPages
        path={`/dashboard/sites/${siteId}/contracts/${contractId}`}
        page={page}
        total={versions.total}
      />
    </section>
  );
}
