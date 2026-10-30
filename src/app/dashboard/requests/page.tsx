"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isTransientAuthError } from "@/lib/auth-errors";
import { PortalIcon } from "@/components/portal/PortalIcon";
import { PriorityBadge, StatusBadge } from "@/components/portal/StatusBadge";
import { inputLimits } from "@/lib/input-limits";
import {
  getRequestPage,
  requestSearchLimit,
  requestPageSize,
} from "@/lib/request-pages";
import { RequestPages } from "@/components/portal/RequestPages";
import { finishSubmission, pendingSubmission } from "@/lib/request-submission";
import {
  isRequestPriority,
  isRequestStatus,
  parseServiceRequest,
  type RequestPriority,
  type RequestStatus,
  type ServiceRequest,
  type ServiceRequestSummary,
} from "@/lib/requests";

type ListedRequest = ServiceRequestSummary &
  Pick<ServiceRequest, "description">;
const listColumns =
  "id, site, system, description, priority, status, created_at";

type Notice = { kind: "success" | "error"; text: string } | null;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ServiceRequestsPage() {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const retryController = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);

  const [requests, setRequests] = useState<ListedRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [site, setSite] = useState("");
  const [system, setSystem] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<RequestPriority>("medium");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "all">(
    "all",
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [loadError, setLoadError] = useState("");
  const [savedSubmission, setSavedSubmission] = useState<{
    id: string;
    userId: string;
    key: string;
  } | null>(null);

  const loadRequests = useCallback(
    async (signal: AbortSignal) => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (signal.aborted) return;
        if (isTransientAuthError(userError)) throw userError;
        if (userError || !user) {
          router.replace("/login");
          return;
        }
        const result = await getRequestPage(
          supabase,
          { page, search, status: statusFilter, userId: user.id },
          signal,
        );
        if (signal.aborted) return;
        setRequests(result.requests);
        setTotal(result.total);
        setLoadError("");
      } catch {
        if (!signal.aborted)
          setLoadError(
            "Unable to connect. Check your connection and try again.",
          );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [router, supabase, page, search, statusFilter],
  );

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(() => {
      if (!controller.signal.aborted) {
        setLoading(true);
        void loadRequests(controller.signal);
      }
    }, 200);

    return () => {
      controller.abort();
      clearTimeout(timer);
      retryController.current?.abort();
    };
  }, [loadRequests, revision]);
  function retryLoad() {
    retryController.current?.abort();
    const controller = new AbortController();
    retryController.current = controller;
    setLoading(true);
    setLoadError("");
    void loadRequests(controller.signal);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    setNotice(null);
    const input = {
      site: site.trim(),
      system: system.trim(),
      description: description.trim(),
      priority,
    };
    if (!input.site || !input.system || !input.description) {
      setNotice({
        kind: "error",
        text: "Please complete all required fields.",
      });
      return;
    }
    if (
      input.site.length > inputLimits.site ||
      input.system.length > inputLimits.system
    ) {
      setNotice({
        kind: "error",
        text: "Site and technical system must each be 120 characters or fewer.",
      });
      return;
    }
    if (input.description.length > inputLimits.description) {
      setNotice({
        kind: "error",
        text: "Issue description must be 5,000 characters or fewer.",
      });
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (isTransientAuthError(userError)) throw userError;
      if (userError || !user) {
        setNotice({
          kind: "error",
          text: "Your session has expired. Sign in again before creating a request.",
        });
        return;
      }
      // Persist before sending. Every uncertain retry keeps this same key.
      const key = pendingSubmission(sessionStorage, user.id);
      const { data, error } = await supabase
        .rpc("create_service_request", {
          p_operation_key: key,
          p_site: input.site,
          p_system: input.system,
          p_description: input.description,
          p_priority: input.priority,
        })
        .select(listColumns)
        .single();
      if (error) {
        if (error.code === "PT409") {
          const { data: previous } = await supabase
            .from("service_requests")
            .select("id")
            .eq("user_id", user.id)
            .eq("operation_key", key)
            .single();
          if (previous) {
            setSavedSubmission({ id: previous.id, userId: user.id, key });
            setNotice({
              kind: "error",
              text: "Your earlier submission was saved with different details. Open it to check, or start a separate request with the details below.",
            });
            return;
          }
        }
        setNotice({
          kind: "error",
          text: "Unable to confirm your request. Your details are still in the form. You can safely try again with the same details.",
        });
        return;
      }
      const createdRequest = parseServiceRequest(data);
      setSearch("");
      setStatusFilter("all");
      setPage(0);
      setRevision((value) => value + 1);
      setLoading(true);
      setRequests((current) =>
        [
          createdRequest,
          ...current.filter((item) => item.id !== createdRequest.id),
        ].slice(0, requestPageSize),
      );
      setSavedSubmission({ id: createdRequest.id, userId: user.id, key });
      try {
        finishSubmission(sessionStorage, user.id, key);
        setSavedSubmission(null);
      } catch {
        setNotice({
          kind: "error",
          text: "Your request was saved. Open it below to check. This tab cannot prepare another submission; restore browser storage and choose Start a separate request.",
        });
        return;
      }
      setSite("");
      setSystem("");
      setDescription("");
      setPriority("medium");
      setNotice({
        kind: "success",
        text: "Service request created. You can track it in the list.",
      });
    } catch {
      setNotice({
        kind: "error",
        text: "Unable to confirm your request. Check your connection and browser storage, then try again with the same details.",
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function startSeparateRequest() {
    if (!savedSubmission || submittingRef.current) return;
    try {
      finishSubmission(
        sessionStorage,
        savedSubmission.userId,
        savedSubmission.key,
      );
      setSavedSubmission(null);
      setNotice({
        kind: "success",
        text: "Ready for a separate request. Review the details before submitting.",
      });
    } catch {
      setNotice({
        kind: "error",
        text: "Unable to prepare a separate request. Check your browser storage and try again.",
      });
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:opacity-70";
  const labelClass = "mb-1.5 block text-xs font-semibold text-slate-700";

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
          Service requests
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Report a fault or check progress on an existing request.
        </p>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section
          id="new-request"
          aria-labelledby="new-request-title"
          className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
        >
          <div className="mb-5 flex items-center gap-2.5">
            <span className="rounded-lg bg-blue-50 p-2 text-blue-700">
              <PortalIcon name="plus" />
            </span>
            <div>
              <h2 id="new-request-title" className="text-sm font-semibold">
                New request
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Describe the issue you need help with
              </p>
            </div>
          </div>
          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            aria-busy={submitting}
          >
            <fieldset
              disabled={submitting || !!savedSubmission}
              className="space-y-4"
            >
              <div>
                <label htmlFor="request-site" className={labelClass}>
                  Site <span className="text-red-600">*</span>
                </label>
                <input
                  id="request-site"
                  type="text"
                  maxLength={inputLimits.site}
                  required
                  value={site}
                  onChange={(event) => setSite(event.target.value)}
                  placeholder="Building, office or site"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="request-system" className={labelClass}>
                  Technical system <span className="text-red-600">*</span>
                </label>
                <input
                  id="request-system"
                  type="text"
                  maxLength={inputLimits.system}
                  required
                  value={system}
                  onChange={(event) => setSystem(event.target.value)}
                  placeholder="CCTV, access control..."
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="request-description" className={labelClass}>
                  Issue description <span className="text-red-600">*</span>
                </label>
                <textarea
                  id="request-description"
                  maxLength={inputLimits.description}
                  required
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe what happened and where..."
                  className={`${inputClass} resize-y`}
                />
              </div>
              <div>
                <label htmlFor="request-priority" className={labelClass}>
                  Priority
                </label>
                <select
                  id="request-priority"
                  value={priority}
                  onChange={(event) => {
                    if (isRequestPriority(event.target.value))
                      setPriority(event.target.value);
                  }}
                  className={inputClass}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#315fd4] px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
              >
                <PortalIcon name="plus" className="h-4 w-4" />
                {submitting ? "Creating request..." : "Create request"}
              </button>
            </fieldset>
            {notice && (
              <p
                role={notice.kind === "error" ? "alert" : "status"}
                className={`rounded-lg px-3 py-2.5 text-xs ${notice.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
              >
                {notice.text}
              </p>
            )}
            {savedSubmission && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Link
                  className="font-semibold text-blue-700 underline"
                  href={`/dashboard/requests/${savedSubmission.id}`}
                >
                  Open saved request
                </Link>
                <button
                  type="button"
                  onClick={startSeparateRequest}
                  className="rounded-lg border border-slate-300 px-3 py-2 font-semibold"
                >
                  Start a separate request
                </button>
              </div>
            )}
          </form>
        </section>

        <section
          aria-labelledby="requests-heading"
          className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white"
        >
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2
                  id="requests-heading"
                  className="text-sm font-semibold text-slate-900"
                >
                  My requests
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Your submissions and updates from the service team
                </p>
              </div>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {loading ? "..." : `${total} total`}
              </span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <label className="relative min-w-[180px] flex-1">
                <span className="sr-only">Search requests</span>
                <PortalIcon
                  name="search"
                  className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                />
                <input
                  type="search"
                  value={search}
                  maxLength={requestSearchLimit}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                    setLoading(true);
                  }}
                  placeholder="Search site, system or issue"
                  className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-xs text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label>
                <span className="sr-only">Filter by status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "all" || isRequestStatus(value)) {
                      setStatusFilter(value);
                      setPage(0);
                      setLoading(true);
                    }
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">All statuses</option>
                  <option value="new">New</option>
                  <option value="in_progress">In progress</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
            </div>
          </div>
          {loading ? (
            <div
              role={notice?.kind === "success" ? undefined : "status"}
              aria-busy="true"
              className="space-y-3 p-5"
            >
              <span className="sr-only">Loading service requests...</span>
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-12 animate-pulse rounded-lg bg-slate-100"
                />
              ))}
            </div>
          ) : loadError ? (
            <div className="p-6">
              <p role="alert" className="text-sm text-red-700">
                {loadError}
              </p>
              <button
                type="button"
                onClick={retryLoad}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <PortalIcon name="refresh" className="h-4 w-4" />
                Try again
              </button>
            </div>
          ) : requests.length === 0 &&
            !search.trim() &&
            statusFilter === "all" ? (
            <div className="p-10 text-center">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                <PortalIcon name="requests" />
              </span>
              <h3 className="text-sm font-semibold">No service requests yet</h3>
              <p className="mt-1.5 text-sm text-slate-500">
                Use the form to report your first technical issue.
              </p>
            </div>
          ) : requests.length === 0 ? (
            <div className="p-10 text-center">
              <h3 className="text-sm font-semibold">No matching requests</h3>
              <p className="mt-1.5 text-sm text-slate-500">
                Try a different search term or status filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setPage(0);
                  setLoading(true);
                }}
                className="mt-4 text-sm font-semibold text-blue-700"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Site / Issue</th>
                    <th className="px-3 py-3 font-medium">System</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Priority</th>
                    <th className="px-5 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requests.map((request) => (
                    <tr
                      key={request.id}
                      className="align-top hover:bg-slate-50/60"
                    >
                      <td className="max-w-[230px] px-5 py-4">
                        <Link
                          href={`/dashboard/requests/${request.id}`}
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          {request.site}
                        </Link>
                        <p
                          className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500"
                          title={request.description}
                        >
                          {request.description}
                        </p>
                      </td>
                      <td className="px-3 py-4 text-slate-600">
                        {request.system}
                      </td>
                      <td className="px-3 py-4">
                        <StatusBadge status={request.status} />
                      </td>
                      <td className="px-3 py-4">
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
    </div>
  );
}
