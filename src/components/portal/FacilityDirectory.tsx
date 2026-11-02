import Link from "next/link";
import { PortalIcon } from "./PortalIcon";

export function DirectoryCard({
  name,
  address,
  href,
}: {
  name: string;
  address: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-w-0 items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <span className="rounded-lg bg-slate-50 p-2.5 text-slate-500">
        <PortalIcon name="building" className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words font-semibold text-slate-900 group-hover:text-blue-700">
          {name}
        </span>
        <span className="mt-1 block break-words text-sm text-slate-500">
          {address || "Address not recorded"}
        </span>
      </span>
      <PortalIcon
        name="arrow-right"
        className="mt-1 h-4 w-4 shrink-0 text-slate-400"
      />
    </Link>
  );
}

export function DirectoryPages({
  path,
  page,
  total,
}: {
  path: string;
  page: number;
  total: number;
}) {
  const last = Math.max(1, Math.ceil(total / 50));
  return (
    <nav
      aria-label="Directory pages"
      className="mt-6 flex flex-wrap items-center gap-4 text-sm"
    >
      {page > 1 && (
        <Link
          href={`${path}?page=${page - 1}`}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-blue-700"
        >
          Previous page
        </Link>
      )}
      <span className="text-slate-500">
        Page {page} · {total} total
      </span>
      {page < last && (
        <Link
          href={`${path}?page=${page + 1}`}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-blue-700"
        >
          Next page
        </Link>
      )}
    </nav>
  );
}
