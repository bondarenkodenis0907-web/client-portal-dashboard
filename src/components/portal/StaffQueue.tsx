"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PriorityBadge, StatusBadge } from "./StatusBadge";
import {
  isRequestStatus,
  type RequestStatus,
  type ServiceRequest,
  type StaffMember,
} from "@/lib/requests";
import { createClient } from "@/lib/supabase/client";
import { getRequestPage, requestSearchLimit } from "@/lib/request-pages";
import { RequestPages } from "./RequestPages";

export function StaffQueue({
  requests,
  staff,
  total: initialTotal,
}: {
  requests: ServiceRequest[];
  staff: StaffMember[];
  total: number;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RequestStatus | "all" | "open">("open");
  const [client] = useState(createClient);
  const [items, setItems] = useState(requests);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await getRequestPage(
          client,
          { page, search, status },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setItems(result.requests);
        setTotal(result.total);
        setError("");
      } catch {
        if (!controller.signal.aborted)
          setError("The service queue could not be loaded. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [client, page, search, status, revision]);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight">
          Service queue
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Assign an engineer, track work and record how each issue was resolved.
        </p>
      </header>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-end gap-4 border-b border-slate-100 p-5">
          <label className="min-w-48 flex-1 text-xs font-semibold text-slate-700">
            Search requests
            <input
              type="search"
              value={search}
              maxLength={requestSearchLimit}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
                setLoading(true);
              }}
              placeholder="Site, system or issue"
              className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Status
            <select
              value={status}
              onChange={(e) => {
                const value = e.target.value;
                if (
                  value === "all" ||
                  value === "open" ||
                  isRequestStatus(value)
                ) {
                  setStatus(value);
                  setPage(0);
                  setLoading(true);
                }
              }}
              className="mt-2 block rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal"
            >
              <option value="open">Open requests</option>
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="in_progress">In progress</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <p className="pb-3 text-xs text-slate-500">
            {loading ? "Loading..." : `${items.length} shown · ${total} total`}
          </p>
        </div>
        {loading ? (
          <p role="status" className="p-8 text-sm">
            Loading service requests...
          </p>
        ) : error ? (
          <div className="p-8">
            <p role="alert">{error}</p>
            <button
              type="button"
              onClick={() => {
                setRevision((value) => value + 1);
                setLoading(true);
              }}
              className="mt-3 rounded border px-3 py-2"
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="p-8 text-sm text-slate-600">
            No requests match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="p-4 font-medium">Site / issue</th>
                  <th className="p-4 font-medium">System</th>
                  <th className="p-4 font-medium">Priority</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Assigned to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((request) => (
                  <tr key={request.id} className="align-top hover:bg-slate-50">
                    <td className="max-w-sm p-4">
                      <Link
                        href={`/dashboard/requests/${request.id}`}
                        className="font-semibold text-blue-700 underline-offset-4 hover:underline"
                      >
                        {request.site}
                      </Link>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                        {request.description}
                      </p>
                    </td>
                    <td className="p-4">{request.system}</td>
                    <td className="p-4">
                      <PriorityBadge priority={request.priority} />
                    </td>
                    <td className="p-4">
                      <StatusBadge status={request.status} />
                    </td>
                    <td className="p-4">
                      {staff.find(
                        (member) => member.user_id === request.assigned_to,
                      )?.display_name ?? "Unassigned"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <RequestPages
          page={page}
          total={total}
          busy={loading}
          onPage={(value) => {
            setPage(value);
            setLoading(true);
          }}
        />
      </section>
    </div>
  );
}
