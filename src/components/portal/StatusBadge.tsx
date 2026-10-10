import type { RequestPriority, RequestStatus } from "@/lib/requests";

const statusLabels: Record<RequestStatus, string> = {
  new: "New",
  in_progress: "In progress",
  closed: "Closed",
};

const statusColors: Record<RequestStatus, string> = {
  new: "bg-blue-50 text-blue-700 ring-blue-100",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-100",
  closed: "bg-emerald-50 text-emerald-700 ring-emerald-100",
};

const priorityColors: Record<RequestPriority, string> = {
  low: "bg-slate-100 text-slate-600 ring-slate-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-100",
  high: "bg-red-50 text-red-700 ring-red-100",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${statusColors[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: RequestPriority }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset ${priorityColors[priority]}`}
    >
      {priority}
    </span>
  );
}
