"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getRequestHistoryPage,
  type RequestHistoryPage,
} from "@/lib/request-history";
import { formatRequestDate } from "@/lib/requests";
import { StatusBadge } from "./StatusBadge";

export function RequestHistory({
  requestId,
  initial,
}: {
  requestId: string;
  initial: RequestHistoryPage;
}) {
  const [client] = useState(createClient);
  const [history, setHistory] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function loadOlder() {
    if (pending.current || !history.hasMore) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError("");
    try {
      const older = await getRequestHistoryPage(
        client,
        requestId,
        history.events.at(-1)!.id,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setHistory((current) => {
        const known = new Set(current.events.map((event) => event.id));
        return {
          events: [
            ...current.events,
            ...older.events.filter((event) => !known.has(event.id)),
          ],
          hasMore: older.hasMore,
        };
      });
    } catch {
      if (!controller.signal.aborted)
        setError("Older events could not be loaded. Please try again.");
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setLoading(false);
      }
    }
  }
  return (
    <section
      aria-label="Request history"
      aria-busy={loading}
      className="rounded-xl border border-slate-200 bg-white p-6"
    >
      <h2 className="font-semibold">Request history</h2>
      {history.events.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">
          This request was submitted before change history was introduced.
        </p>
      ) : (
        <>
          <ol className="mt-5 space-y-5">
            {history.events.map((event) => (
              <li key={event.id} className="border-l-2 border-blue-200 pl-4">
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
          <p role="status" className="mt-5 text-xs text-slate-500">
            {history.events.length} events shown
            {!history.hasMore && " · All events loaded"}
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {history.hasMore && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadOlder()}
          className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-60"
        >
          {loading ? "Loading older events..." : "Load older events"}
        </button>
      )}
    </section>
  );
}
