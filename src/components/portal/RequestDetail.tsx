"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  formatRequestDate,
  type RequestEvent,
  type ServiceRequest,
  type StaffMember,
  type RequestStatus,
} from "@/lib/requests";
import { PriorityBadge, StatusBadge } from "./StatusBadge";

export function RequestDetail({
  request,
  events,
  staff,
  isStaff,
}: {
  request: ServiceRequest;
  events: RequestEvent[];
  staff: StaffMember[];
  isStaff: boolean;
}) {
  const [supabase] = useState(createClient);
  const router = useRouter();
  const busyRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [assignedTo, setAssignedTo] = useState(request.assigned_to ?? "");
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const currentAssignee =
    staff.find((member) => member.user_id === request.assigned_to)
      ?.display_name ??
    events.find((event) => event.assigned_name)?.assigned_name;

  async function save(status: RequestStatus) {
    if (busyRef.current) return;
    setError("");
    setMessage("");
    if (!assignedTo) {
      setError("Choose an engineer before saving.");
      return;
    }
    if (status === "closed" && resolution.trim().length < 10) {
      setError("Describe the completed work in at least 10 characters.");
      return;
    }
    busyRef.current = true;
    setSaving(true);
    try {
      const { data, error: updateError } = await supabase
        .from("service_requests")
        .update({
          assigned_to: assignedTo,
          status,
          resolution: status === "closed" ? resolution.trim() : null,
        })
        .eq("id", request.id)
        .eq("updated_at", request.updated_at)
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!data) {
        setError(
          "This request changed or your access was removed. Reload before saving again.",
        );
        return;
      }
      setMessage("Changes saved.");
      router.refresh();
    } catch {
      setError(
        "Saving could not be confirmed. Your edits are still here; reload the request before trying again.",
      );
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(request.status === "new" ? "in_progress" : "closed");
  }
  const fieldClass =
    "mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 focus:outline-blue-600";
  return (
    <div className="space-y-6">
      <Link
        href={isStaff ? "/dashboard/staff" : "/dashboard/requests"}
        className="text-sm font-semibold text-blue-700"
      >
        ← {isStaff ? "Service queue" : "My requests"}
      </Link>
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-semibold tracking-tight">
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
        <div className="space-y-6">
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
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold">Request history</h2>
            {events.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                This request was submitted before change history was introduced.
              </p>
            ) : (
              <ol className="mt-5 space-y-5">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="border-l-2 border-blue-200 pl-4"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge status={event.status} />
                      <time
                        dateTime={event.created_at}
                        className="text-xs text-slate-500"
                      >
                        {formatRequestDate(event.created_at)}
                      </time>
                    </div>
                    {event.assigned_name && (
                      <p className="mt-2 text-sm">
                        Engineer: {event.assigned_name}
                      </p>
                    )}
                    {event.resolution && (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">
                        {event.resolution}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <section className="rounded-xl border border-slate-200 bg-white p-6">
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
          ) : request.status === "closed" ? (
            <p className="mt-3 text-sm text-slate-600">
              The resolution and history are saved. Closed requests cannot be
              edited.
            </p>
          ) : (
            <form
              onSubmit={submit}
              aria-busy={saving}
              className="mt-5 space-y-5"
            >
              <fieldset disabled={saving} className="space-y-5">
                <label className="block text-xs font-semibold text-slate-700">
                  Assigned engineer
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    required
                    className={fieldClass}
                  >
                    <option value="">Choose an engineer</option>
                    {staff.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                {request.status === "in_progress" && (
                  <>
                    <button
                      type="button"
                      onClick={() => void save("in_progress")}
                      className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold"
                    >
                      Save assignment
                    </button>
                    <label className="block text-xs font-semibold text-slate-700">
                      Completed work
                      <textarea
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        required
                        minLength={10}
                        maxLength={5000}
                        rows={5}
                        placeholder="What was repaired and how was it checked?"
                        className={fieldClass}
                      />
                    </label>
                  </>
                )}
                <button
                  type="submit"
                  className="w-full rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : request.status === "new"
                      ? "Assign and start work"
                      : "Close request"}
                </button>
              </fieldset>
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              {message && (
                <p role="status" className="text-sm text-emerald-700">
                  {message}
                </p>
              )}
              <button
                type="button"
                onClick={() => router.refresh()}
                className="text-sm font-semibold text-blue-700"
              >
                Reload request
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
