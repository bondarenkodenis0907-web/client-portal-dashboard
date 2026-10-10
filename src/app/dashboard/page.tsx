"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import {
  parseServiceRequest,
  type ServiceRequestSummary,
} from "@/lib/requests";
import { PortalIcon } from "@/components/portal/PortalIcon";
import { PriorityBadge, StatusBadge } from "@/components/portal/StatusBadge";

type RequestCounts = {
  new: number;
  inProgress: number;
  closed: number;
  highPriority: number;
};

type Overview = {
  company: string;
  recent: ServiceRequestSummary[];
  urgent: ServiceRequestSummary[];
  counts: RequestCounts;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-medium text-slate-600">{label}</p>

      <p className="mt-3 text-[32px] font-semibold leading-none tracking-tight text-slate-900">
        {value}
      </p>

      <p className="mt-3 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function StatusBreakdown({ counts }: { counts: RequestCounts }) {
  const total = counts.new + counts.inProgress + counts.closed;

  const rows = [
    {
      label: "New",
      value: counts.new,
      color: "bg-blue-600",
    },
    {
      label: "In progress",
      value: counts.inProgress,
      color: "bg-amber-500",
    },
    {
      label: "Closed",
      value: counts.closed,
      color: "bg-emerald-600",
    },
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          Request status
        </h2>

        <span className="text-xs text-slate-500">{total} total</span>
      </div>

      <div className="space-y-5">
        {rows.map((row) => {
          const percentage =
            total > 0 ? Math.round((row.value / total) * 100) : 0;

          return (
            <div key={row.label}>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-slate-600">{row.label}</span>

                <span className="font-medium text-slate-900">
                  {row.value}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {percentage}%
                  </span>
                </span>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${row.color}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PriorityRequests({
  items,
  count,
}: {
  items: ServiceRequestSummary[];
  count: number;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            High-priority requests
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Open issues reported as high priority
          </p>
        </div>

        <span className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
          {count} open
        </span>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-7 sm:px-6">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <PortalIcon name="check" className="text-emerald-600" />
            No open high-priority requests
          </div>

          <p className="mt-2 text-sm text-slate-500">
            Any new high-priority issues will appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((request) => (
            <div
              key={request.id}
              className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {request.site}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {request.system} · {formatDate(request.created_at)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <PriorityBadge priority={request.priority} />
                <StatusBadge status={request.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      {count > 3 && (
        <div className="border-t border-slate-100 px-5 py-3 sm:px-6">
          <Link
            href="/dashboard/requests"
            className="text-xs font-semibold text-blue-700 hover:text-blue-800"
          >
            View all requests
          </Link>
        </div>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [supabase] = useState(createClient);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadOverview() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (cancelled) return;

        if (userError) {
          if (
            userError.status === 401 ||
            userError.status === 403 ||
            userError.name === "AuthSessionMissingError"
          ) {
            router.replace("/login");
            return;
          }

          throw userError;
        }

        if (!user) {
          router.replace("/login");
          return;
        }

        const [
          profile,
          recent,
          urgent,
          newlyCreated,
          inProgress,
          closed,
          highPriority,
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select("company")
            .eq("id", user.id)
            .maybeSingle(),

          supabase
            .from("service_requests")
            .select("id, site, system, status, priority, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(5)
            .abortSignal(controller.signal),

          supabase
            .from("service_requests")
            .select("id, site, system, status, priority, created_at")
            .eq("priority", "high")
            .neq("status", "closed")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(3)
            .abortSignal(controller.signal),

          supabase
            .from("service_requests")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("status", "new"),

          supabase
            .from("service_requests")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("status", "in_progress"),

          supabase
            .from("service_requests")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("status", "closed"),

          supabase
            .from("service_requests")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("priority", "high")
            .neq("status", "closed"),
        ]);

        if (cancelled) return;

        const results = [
          profile,
          recent,
          urgent,
          newlyCreated,
          inProgress,
          closed,
          highPriority,
        ];

        if (results.some((result) => result.error)) {
          throw new Error("Unable to load service data");
        }

        setOverview({
          company: profile.data?.company ?? "",
          recent: (recent.data ?? []).map(parseServiceRequest),
          urgent: (urgent.data ?? []).map(parseServiceRequest),
          counts: {
            new: newlyCreated.count ?? 0,
            inProgress: inProgress.count ?? 0,
            closed: closed.count ?? 0,
            highPriority: highPriority.count ?? 0,
          },
        });

        setLoadError("");
      } catch {
        if (!cancelled) {
          setLoadError(
            "Could not load service requests. Check your connection and try again.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadOverview();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [router, supabase, retryCount]);

  function retry() {
    setLoading(true);
    setLoadError("");
    setRetryCount((value) => value + 1);
  }

  const counts = overview?.counts;
  const openRequests = counts ? counts.new + counts.inProgress : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
          Service overview
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          {overview?.company
            ? `Service requests for ${overview.company}`
            : "Technical requests and maintenance activity for your sites."}
        </p>
      </header>

      {loading ? (
        <div role="status" aria-busy="true" className="space-y-5">
          <span className="sr-only">Loading service overview</span>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white"
              />
            ))}
          </div>

          <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
        </div>
      ) : loadError ? (
        <section className="max-w-xl rounded-xl border border-red-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">
            Unable to load overview
          </h2>

          <p role="alert" className="mt-2 text-sm text-red-700">
            {loadError}
          </p>

          <button
            type="button"
            onClick={retry}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <PortalIcon name="refresh" />
            Try again
          </button>
        </section>
      ) : overview && counts ? (
        <>
          <section
            aria-label="Request statistics"
            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            <StatCard
              label="Open requests"
              value={openRequests}
              detail="New and in progress"
            />

            <StatCard
              label="High priority"
              value={counts.highPriority}
              detail="Open requests requiring attention"
            />

            <StatCard
              label="In progress"
              value={counts.inProgress}
              detail="Active requests"
            />

            <StatCard
              label="Closed"
              value={counts.closed}
              detail="Completed requests"
            />
          </section>

          <section
            aria-labelledby="recent-requests-title"
            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
              <div>
                <h2
                  id="recent-requests-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Recent requests
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Five most recent submissions
                </p>
              </div>

              <Link
                href="/dashboard/requests"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800"
              >
                View all
                <PortalIcon name="arrow-right" className="h-4 w-4" />
              </Link>
            </div>

            {overview.recent.length === 0 ? (
              <div className="px-6 py-10">
                <h3 className="text-sm font-semibold text-slate-900">
                  No requests submitted
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Report a technical issue to start your service history.
                </p>

                <Link
                  href="/dashboard/requests#new-request"
                  className="mt-4 inline-block text-sm font-semibold text-blue-700"
                >
                  Create your first request
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[660px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">Site</th>
                      <th className="px-4 py-3 font-medium">System</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Priority</th>
                      <th className="px-5 py-3 font-medium">Submitted</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {overview.recent.map((request) => (
                      <tr key={request.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-medium text-slate-900">
                          {request.site}
                        </td>

                        <td className="px-4 py-4 text-slate-600">
                          {request.system}
                        </td>

                        <td className="px-4 py-4">
                          <StatusBadge status={request.status} />
                        </td>

                        <td className="px-4 py-4">
                          <PriorityBadge priority={request.priority} />
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                          {formatDate(request.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <PriorityRequests
              items={overview.urgent}
              count={counts.highPriority}
            />

            <StatusBreakdown counts={counts} />
          </div>
        </>
      ) : null}
    </div>
  );
}
