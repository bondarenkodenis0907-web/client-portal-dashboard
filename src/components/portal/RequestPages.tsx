import { requestPageSize } from "@/lib/request-pages";

export function RequestPages({
  page,
  total,
  busy,
  onPage,
}: {
  page: number;
  total: number;
  busy: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <nav
      aria-label="Request pages"
      className="flex items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm"
    >
      <button
        type="button"
        disabled={busy || page === 0}
        onClick={() => onPage(page - 1)}
        className="rounded border px-3 py-2 disabled:opacity-40"
      >
        Previous page
      </button>
      <span>
        Page {page + 1} of {Math.max(1, Math.ceil(total / requestPageSize))}
      </span>
      <button
        type="button"
        disabled={busy || (page + 1) * requestPageSize >= total}
        onClick={() => onPage(page + 1)}
        className="rounded border px-3 py-2 disabled:opacity-40"
      >
        Next page
      </button>
    </nav>
  );
}
