import Link from "next/link";

export default function FacilityNotFound() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-7">
      <h1 className="text-lg font-semibold">Site or building unavailable</h1>
      <p className="mt-2 text-sm text-slate-500">
        Check the link or contact your service team about access.
      </p>
      <Link
        href="/dashboard/sites"
        className="mt-5 inline-block text-sm font-medium text-blue-700"
      >
        All sites
      </Link>
    </section>
  );
}
