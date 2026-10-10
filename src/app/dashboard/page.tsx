"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PortalIcon, type PortalIconName } from "@/components/portal/PortalIcon";
import { PriorityBadge, StatusBadge } from "@/components/portal/StatusBadge";

type RequestStatus = "new" | "in_progress" | "closed";
type Priority = "low" | "medium" | "high";

type RecentRequest = {
  id: string;
  site: string;
  system: string;
  status: RequestStatus;
  priority: Priority;
  created_at: string;
};

type Overview = {
  fullName: string;
  company: string;
  recent: RecentRequest[];
  counts: { new: number; inProgress: number; closed: number; highPriority: number };
};

function Metric({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: PortalIconName }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.025)] sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
        <span className="rounded-lg bg-blue-50 p-2 text-blue-700"><PortalIcon name={icon} /></span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user || userError?.status === 401 || userError?.status === 403 || userError?.name === "AuthSessionMissingError") {
          router.replace("/login");
          return;
        }
        if (userError) throw userError;

        const [profile, recent, newlyCreated, inProgress, closed, urgent] = await Promise.all([
          supabase.from("profiles")
            .select("full_name, company")
            .eq("id", user.id)
            .maybeSingle(),
          supabase.from("service_requests")
            .select("id, site, system, status, priority, created_at")
            .order("created_at", { ascending: false })
            .limit(5)
            .abortSignal(controller.signal),
          supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
          supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
          supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "closed"),
          supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("priority", "high").neq("status", "closed"),
        ]);
        if (cancelled) return;
        if (recent.error || newlyCreated.error || inProgress.error || closed.error || urgent.error) {
          throw new Error("Request summary unavailable");
        }

        setOverview({
          fullName: profile.data?.full_name ?? "",
          company: profile.data?.company ?? "",
          recent: (recent.data ?? []) as RecentRequest[],
          counts: {
            new: newlyCreated.count ?? 0,
            inProgress: inProgress.count ?? 0,
            closed: closed.count ?? 0,
            highPriority: urgent.count ?? 0,
          },
        });
        setLoadError("");
      } catch {
        if (!cancelled) setLoadError("Could not load your service overview. Check your connection and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadOverview();
    return () => { cancelled = true; controller.abort(); };
  }, [router, supabase, retryCount]);

  function retry() {
    setLoading(true);
    setLoadError("");
    setRetryCount((value) => value + 1);
  }

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.16em] text-blue-700">Service workspace</p>
          <h1 className="text-[27px] font-semibold tracking-tight text-slate-900 sm:text-[30px]">{overview?.fullName ? `Welcome back, ${overview.fullName.split(" ")[0]}` : "Service overview"}</h1>
          <p className="mt-1.5 text-sm text-slate-500">Your technical requests and site maintenance at a glance.</p>
        </div>
        <Link href="/dashboard/requests#new-request" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"><PortalIcon name="plus" className="h-4 w-4" />Create a request</Link>
      </div>

      {loading ? (
        <div aria-busy="true" role="status" className="space-y-5">
          <span className="sr-only">Loading your service overview...</span>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[1, 2, 3, 4].map((n) => <div key={n} className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />)}</div>
          <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
        </div>
      ) : loadError ? (
        <section className="max-w-xl rounded-xl border border-red-200 bg-white p-7">
          <h2 className="text-lg font-semibold text-slate-900">Unable to load overview</h2>
          <p role="alert" className="mt-2 text-sm text-red-700">{loadError}</p>
          <button type="button" onClick={retry} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white"><PortalIcon name="refresh" />Try again</button>
        </section>
      ) : overview && (
        <>
          <section aria-label="Request statistics" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="New requests" value={overview.counts.new} detail="Awaiting review" icon="requests" />
            <Metric label="In progress" value={overview.counts.inProgress} detail="Being worked on" icon="clock" />
            <Metric label="Closed" value={overview.counts.closed} detail="Completed requests" icon="check" />
            <Metric label="High priority" value={overview.counts.highPriority} detail="Open and urgent" icon="alert" />
          </section>

          <section aria-labelledby="recent-requests-title" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.025)]">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div><h2 id="recent-requests-title" className="text-sm font-semibold text-slate-900">Recent service requests</h2><p className="mt-1 text-xs text-slate-500">Your five latest submissions</p></div>
              <Link href="/dashboard/requests" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800">View all <PortalIcon name="arrow-right" className="h-4 w-4" /></Link>
            </div>
            {overview.recent.length === 0 ? (
              <div className="px-5 py-12 text-center"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-500"><PortalIcon name="requests" /></div><h3 className="text-sm font-semibold">No service requests yet</h3><p className="mt-1 text-sm text-slate-500">Report an issue at a site to start tracking its status.</p><Link href="/dashboard/requests#new-request" className="mt-4 inline-block text-sm font-semibold text-blue-700">Create your first request →</Link></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[660px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50/80 text-[11px] font-medium text-slate-500"><tr><th className="px-5 py-3 font-medium">Site</th><th className="px-4 py-3 font-medium">System</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Priority</th><th className="px-5 py-3 font-medium">Submitted</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {overview.recent.map((request) => (
                      <tr key={request.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-4 font-medium text-slate-800">{request.site}</td>
                        <td className="px-4 py-4 text-slate-600">{request.system}</td>
                        <td className="px-4 py-4"><StatusBadge status={request.status} /></td>
                        <td className="px-4 py-4"><PriorityBadge priority={request.priority} /></td>
                        <td className="px-5 py-4 whitespace-nowrap text-slate-500">{formatDate(request.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2.5"><PortalIcon name="activity" className="text-blue-700" /><h2 className="text-sm font-semibold">How service requests work</h2></div>
              <ol className="space-y-4">
                <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">1</span><div><p className="text-sm font-medium text-slate-800">Submit an issue</p><p className="mt-0.5 text-xs text-slate-500">Specify the site, system, priority and symptoms.</p></div></li>
                <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">2</span><div><p className="text-sm font-medium text-slate-800">Track its status</p><p className="mt-0.5 text-xs text-slate-500">Follow updates in your request history.</p></div></li>
                <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">3</span><div><p className="text-sm font-medium text-slate-800">Review the result</p><p className="mt-0.5 text-xs text-slate-500">Closed requests remain available for reference.</p></div></li>
              </ol>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2.5"><PortalIcon name="building" className="text-blue-700" /><h2 className="text-sm font-semibold">Your workspace</h2></div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Company</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{overview.company || "Not added yet"}</p>
              <p className="mt-4 text-xs leading-5 text-slate-500">Keep your profile details accurate so service requests are associated with the right account.</p>
              <Link href="/dashboard/settings" className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-semibold text-blue-700">Manage profile <PortalIcon name="arrow-right" className="h-4 w-4" /></Link>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
