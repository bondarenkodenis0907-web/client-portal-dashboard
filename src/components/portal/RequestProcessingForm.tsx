"use client";

import { useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputLimits } from "@/lib/input-limits";
import {
  parseServiceRequest,
  parseRequestEvent,
  requestColumns,
  type RequestEvent,
  type RequestStatus,
  type ServiceRequest,
  type StaffMember,
} from "@/lib/requests";
import { StatusBadge } from "./StatusBadge";

type Phase = "editing" | "conflict" | "uncertain" | "review" | "unavailable";

export function RequestProcessingForm({
  request,
  staff,
  onSnapshot,
}: {
  request: ServiceRequest;
  staff: StaffMember[];
  onSnapshot: (
    request: ServiceRequest,
    events?: RequestEvent[],
    staff?: StaffMember[],
  ) => void;
}) {
  const [supabase] = useState(createClient);
  const busyRef = useRef(false);
  // A refresh must not silently rebase a draft onto a newer server version.
  const [snapshot, setSnapshot] = useState(request);
  const [directory, setDirectory] = useState(staff);
  const [assignedTo, setAssignedTo] = useState(request.assigned_to ?? "");
  const [resolution, setResolution] = useState("");
  const [phase, setPhase] = useState<Phase>("editing");
  const [activity, setActivity] = useState<"save" | "reload" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [review, setReview] = useState<{
    request: ServiceRequest;
    staff: StaffMember[];
    events: RequestEvent[];
  } | null>(null);
  const selectedStaff = directory.find(
    (member) => member.user_id === assignedTo,
  );
  const activeStaff = directory.filter((member) => member.is_active);
  const blocked = phase !== "editing" || activity !== null;

  async function save(status: RequestStatus) {
    if (busyRef.current || phase !== "editing" || snapshot.status === "closed")
      return;
    setError("");
    setMessage("");
    if (!assignedTo || !selectedStaff?.is_active) {
      setError("Choose an active engineer before saving.");
      return;
    }
    const completedWork = resolution.trim();
    if (
      status === "closed" &&
      completedWork.length < inputLimits.resolutionMinimum
    ) {
      setError("Describe the completed work in at least 10 characters.");
      return;
    }
    if (status === "closed" && completedWork.length > inputLimits.resolution) {
      setError("Completed work must be 5,000 characters or fewer.");
      return;
    }
    busyRef.current = true;
    setActivity("save");
    try {
      const { data, error: updateError } = await supabase
        .rpc("process_service_request", {
          p_request_id: snapshot.id,
          p_expected_version: snapshot.version,
          p_assigned_to: assignedTo,
          p_status: status,
          p_resolution: status === "closed" ? completedWork : "",
        })
        .select(requestColumns)
        .single()
        .retry(false);
      if (updateError) {
        setPhase(updateError.code === "PT409" ? "conflict" : "uncertain");
        setError(
          updateError.code === "PT409"
            ? "This request changed. Your edits are still here. Load the latest saved details and review them before saving again."
            : "Saving could not be confirmed. Your edits are still here; load the latest request before trying again.",
        );
        return;
      }
      const saved = parseServiceRequest(data);
      setSnapshot(saved);
      setAssignedTo(saved.assigned_to ?? "");
      if (saved.status === "closed") setResolution("");
      setReview(null);
      setMessage("Changes saved.");
      // A history read failure cannot turn a confirmed write into uncertainty,
      // or replace this component and discard an unfinished resolution draft.
      onSnapshot(saved);
      try {
        const history = await supabase
          .from("request_events")
          .select("id, status, assigned_name, resolution, created_at")
          .eq("request_id", saved.id)
          .order("id", { ascending: false })
          .retry(false);
        if (history.error) throw Error("History read failed");
        onSnapshot(saved, history.data.map(parseRequestEvent));
      } catch {
        setMessage(
          "Changes saved. History could not be refreshed. Reload the request to try again.",
        );
      }
    } catch {
      setPhase("uncertain");
      setError(
        "Saving could not be confirmed. Your edits are still here; load the latest request before trying again.",
      );
    } finally {
      busyRef.current = false;
      setActivity(null);
    }
  }

  async function reloadLatest() {
    if (busyRef.current) return;
    busyRef.current = true;
    setActivity("reload");
    setError("");
    setMessage("");
    setReview(null);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) throw Error("Session unavailable");
      const [latest, members, history] = await Promise.all([
        supabase
          .from("service_requests")
          .select(requestColumns)
          .eq("id", snapshot.id)
          .maybeSingle()
          .retry(false),
        supabase
          .from("service_staff")
          .select("user_id, display_name, is_active")
          .order("display_name")
          .retry(false),
        supabase
          .from("request_events")
          .select("id, status, assigned_name, resolution, created_at")
          .eq("request_id", snapshot.id)
          .order("id", { ascending: false })
          .retry(false),
      ]);
      if (latest.error || members.error || history.error)
        throw Error("Read failed");
      if (
        !latest.data ||
        !members.data.some(
          (member) => member.user_id === user.id && member.is_active,
        )
      ) {
        setPhase("unavailable");
        setError(
          "This request is unavailable or your processing access was removed. Your edits remain in this form.",
        );
        return;
      }
      setReview({
        request: parseServiceRequest(latest.data),
        staff: members.data,
        events: history.data.map(parseRequestEvent),
      });
      setPhase("review");
      setMessage("Latest saved details loaded. Review them before continuing.");
    } catch {
      setPhase("uncertain");
      setError(
        "Unable to load the latest request. Your edits are still here. Check your connection and try again.",
      );
    } finally {
      busyRef.current = false;
      setActivity(null);
    }
  }

  function acceptLatest(keepEdits: boolean) {
    if (
      !review ||
      busyRef.current ||
      (keepEdits && review.request.status === "closed")
    )
      return;
    if (!keepEdits || assignedTo === (snapshot.assigned_to ?? ""))
      setAssignedTo(review.request.assigned_to ?? "");
    if (!keepEdits) setResolution("");
    setSnapshot(review.request);
    setDirectory(review.staff);
    onSnapshot(review.request, review.events, review.staff);
    setReview(null);
    setPhase("editing");
    setError("");
    setMessage(
      keepEdits
        ? "Your edits are ready for review. Save when you are satisfied with them."
        : "Saved details selected.",
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(snapshot.status === "new" ? "in_progress" : "closed");
  }
  const fieldClass =
    "mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 focus:outline-blue-600";
  return (
    <form
      onSubmit={submit}
      aria-busy={activity !== null}
      className="mt-5 space-y-5"
    >
      {snapshot.status === "closed" ? (
        <p className="text-sm text-slate-600">
          The resolution and history are saved. Closed requests cannot be
          edited.
        </p>
      ) : (
        <fieldset disabled={activity !== null} className="space-y-5">
          <label className="block text-xs font-semibold text-slate-700">
            Assigned engineer
            <select
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
              required
              className={fieldClass}
            >
              <option value="">Choose an engineer</option>
              {assignedTo && !selectedStaff?.is_active && (
                <option value={assignedTo} disabled>
                  {selectedStaff
                    ? `${selectedStaff.display_name} (inactive)`
                    : "Previously selected engineer (unavailable)"}
                </option>
              )}
              {activeStaff.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.display_name}
                </option>
              ))}
            </select>
          </label>
          {assignedTo && !selectedStaff?.is_active && (
            <p role="status" className="text-sm text-amber-800">
              The selected engineer is no longer active. Choose an active
              engineer to continue processing this request.
            </p>
          )}
          {snapshot.status === "in_progress" && (
            <>
              <button
                type="button"
                disabled={blocked}
                onClick={() => void save("in_progress")}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                Save assignment
              </button>
              <label className="block text-xs font-semibold text-slate-700">
                Completed work
                <textarea
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                  required
                  minLength={inputLimits.resolutionMinimum}
                  maxLength={inputLimits.resolution}
                  rows={5}
                  placeholder="What was repaired and how was it checked?"
                  className={fieldClass}
                />
              </label>
            </>
          )}
          <button
            type="submit"
            disabled={blocked}
            className="w-full rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {activity === "save"
              ? "Saving..."
              : snapshot.status === "new"
                ? "Assign and start work"
                : "Close request"}
          </button>
        </fieldset>
      )}
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
      {review && (
        <section
          aria-label="Latest saved request"
          className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"
        >
          <h3 className="font-semibold">Latest saved details</h3>
          <StatusBadge status={review.request.status} />
          <p>
            Assigned engineer:{" "}
            {review.staff.find(
              (member) => member.user_id === review.request.assigned_to,
            )?.display_name ?? "Not assigned"}
          </p>
          {review.request.resolution && (
            <p className="whitespace-pre-wrap break-words">
              Saved completed work: {review.request.resolution}
            </p>
          )}
          {review.request.status === "closed" && (
            <p>
              This request is already closed. Your unsaved edits remain above;
              they cannot replace the saved result.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {review.request.status !== "closed" && (
              <button
                type="button"
                onClick={() => acceptLatest(true)}
                className="rounded-lg bg-blue-700 px-3 py-2 font-semibold text-white"
              >
                Keep my edits and continue
              </button>
            )}
            <button
              type="button"
              onClick={() => acceptLatest(false)}
              className="rounded-lg border border-slate-400 px-3 py-2 font-semibold"
            >
              Use saved details and discard my edits
            </button>
          </div>
        </section>
      )}
      <button
        type="button"
        disabled={activity !== null}
        onClick={() => void reloadLatest()}
        className="text-sm font-semibold text-blue-700 disabled:opacity-60"
      >
        {activity === "reload" ? "Loading latest request..." : "Reload request"}
      </button>
    </form>
  );
}
