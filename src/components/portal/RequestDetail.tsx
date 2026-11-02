"use client";

import { RequestProcessingForm } from "./RequestProcessingForm";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  formatRequestDate,
  type ServiceRequest,
  type StaffMember,
} from "@/lib/requests";
import { PriorityBadge, StatusBadge } from "./StatusBadge";
import { RequestHistory } from "./RequestHistory";
import type { RequestHistoryPage } from "@/lib/request-history";

export function RequestDetail({
  request: serverRequest,
  history: serverHistory,
  staff: serverStaff,
  isStaff,
}: {
  request: ServiceRequest;
  history: RequestHistoryPage;
  staff: StaffMember[];
  isStaff: boolean;
}) {
  const router = useRouter();
  const [local, setLocal] = useState<{
    request: ServiceRequest;
    history: RequestHistoryPage;
    staff: StaffMember[];
  } | null>(null);
  const server = {
    request: serverRequest,
    history: serverHistory,
    staff: serverStaff,
  };
  const { request, history, staff } =
    local && local.request.version >= serverRequest.version ? local : server;
  function showSnapshot(
    next: ServiceRequest,
    history?: RequestHistoryPage,
    directory?: StaffMember[],
  ) {
    setLocal((current) => {
      const previous =
        current && current.request.version >= serverRequest.version
          ? current
          : server;
      if (next.version < previous.request.version) return current;
      return {
        request: next,
        history: history ?? previous.history,
        staff: directory ?? previous.staff,
      };
    });
  }
  const currentAssignee =
    staff.find((member) => member.user_id === request.assigned_to)
      ?.display_name ??
    history.events.find((event) => event.assigned_name)?.assigned_name;
  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      <Link
        href={isStaff ? "/dashboard/staff" : "/dashboard/requests"}
        className="text-sm font-semibold text-blue-700"
      >
        ← {isStaff ? "Service queue" : "My requests"}
      </Link>
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 max-w-full text-[28px] font-semibold tracking-tight">
            {request.site}
          </h1>
          <StatusBadge status={request.status} />
          <PriorityBadge priority={request.priority} />
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {request.system} · Submitted {formatRequestDate(request.created_at)}
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,400px)]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold">Reported issue</h2>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
              {request.description}
            </p>
            <p className="mt-5 text-sm text-slate-600">
              Assigned engineer:{" "}
              <span className="font-medium text-slate-900">
                {currentAssignee ?? "Not assigned yet"}
              </span>
            </p>
          </section>
          {request.resolution && (
            <section className="rounded-xl border border-emerald-200 bg-white p-6">
              <h2 className="font-semibold text-emerald-800">Work completed</h2>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                {request.resolution}
              </p>
              {request.closed_at && (
                <p className="mt-4 text-xs text-slate-500">
                  Closed {formatRequestDate(request.closed_at)}
                </p>
              )}
            </section>
          )}
          <RequestHistory
            key={`${request.id}:${history.events[0]?.id}:${history.events.at(-1)?.id}`}
            requestId={request.id}
            initial={history}
          />
        </div>
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">
            {isStaff ? "Process request" : "What happens next"}
          </h2>
          {!isStaff ? (
            <>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {request.status === "new"
                  ? "The service team will assign an engineer and start work. Return here to check progress."
                  : request.status === "in_progress"
                    ? "An engineer is working on this issue. The completed work will appear here when the request is closed."
                    : "This request is complete. If the issue returns, submit a new request with the updated details."}
              </p>
              <button
                type="button"
                onClick={() => router.refresh()}
                className="mt-4 text-sm font-semibold text-blue-700"
              >
                Refresh status
              </button>
            </>
          ) : (
            <RequestProcessingForm
              request={request}
              staff={staff}
              onSnapshot={showSnapshot}
            />
          )}
        </section>
      </div>
    </div>
  );
}
