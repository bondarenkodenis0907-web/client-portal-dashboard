"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Priority = "low" | "medium" | "high";
type RequestStatus = "new" | "in_progress" | "closed";

type ServiceRequest = {
  id: string;
  site: string;
  system: string;
  description: string;
  priority: Priority;
  status: RequestStatus;
  created_at: string;
};

export default function ServiceRequestsPage() {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const retryController = useRef<AbortController | null>(null);

  const [requests, setRequests] = useState<ServiceRequest[]>([]);

  const [site, setSite] = useState("");
  const [system, setSystem] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  const loadRequests = useCallback((signal: AbortSignal) => {
    return supabase.auth.getUser().then(async ({ data: { user }, error: userError }) => {
      if (signal.aborted) return;
      if (userError || !user) {
        router.replace("/login");
        return;
      }
      const { data, error } = await supabase
        .from("service_requests")
        .select("id, site, system, description, priority, status, created_at")
        .order("created_at", { ascending: false })
        .abortSignal(signal);
      if (signal.aborted) return;
      if (error) {
        setLoadError("Unable to load your requests. Please try again.");
      } else {
        setRequests((data ?? []) as ServiceRequest[]);
        setLoadError("");
      }
    }).catch(() => {
      if (!signal.aborted) setLoadError("Unable to connect. Check your connection and try again.");
    }).finally(() => {
      if (!signal.aborted) setLoading(false);
    });
  }, [router, supabase]);

  useEffect(() => {
    const controller = new AbortController();
    void loadRequests(controller.signal);
    return () => {
      controller.abort();
      retryController.current?.abort();
    };
  }, [loadRequests]);

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

    if (submitting) {
      return;
    }

    setMessage("");

    if (!site.trim() || !system.trim() || !description.trim()) {
      setMessage("Please complete all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setMessage("Your session has expired. Sign in again before creating a request.");
        return;
      }
      const { data, error } = await supabase
        .from("service_requests")
        .insert({ user_id: user.id, site: site.trim(), system: system.trim(),
          description: description.trim(), priority })
        .select("id, site, system, description, priority, status, created_at")
        .single();
      if (error) {
        setMessage("Unable to create request: " + error.message);
        return;
      }
      setRequests((current) => [data as ServiceRequest, ...current]);
      setSite("");
      setSystem("");
      setDescription("");
      setPriority("medium");
      setMessage("Service request created.");
    } catch {
      setMessage("Unable to confirm your request. Check your connection and reload the list before submitting again.");
    } finally {
      setSubmitting(false);
    }
  }

  function formatStatus(status: RequestStatus) {
    if (status === "in_progress") {
      return "In progress";
    }

    if (status === "closed") {
      return "Closed";
    }

    return "New";
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-lg font-medium">
          Loading service requests...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">
              Client Portal
            </p>

            <h1 className="text-3xl font-bold">
              Service Requests
            </h1>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded border bg-white px-4 py-2"
          >
            Back to dashboard
          </button>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-semibold">
              New request
            </h2>

            <form
              onSubmit={handleSubmit}
              className="mt-5 space-y-4"
            >
              <div>
                <label htmlFor="request-site" className="mb-1 block text-sm font-medium">
                  Site
                </label>

                <input
                  id="request-site"
                  required
                  type="text"
                  value={site}
                  onChange={(event) => setSite(event.target.value)}
                  placeholder="Office, building or site"
                  className="w-full rounded border p-3"
                />
              </div>

              <div>
                <label htmlFor="request-system" className="mb-1 block text-sm font-medium">
                  System
                </label>

                <input
                  id="request-system"
                  required
                  type="text"
                  value={system}
                  onChange={(event) => setSystem(event.target.value)}
                  placeholder="CCTV, access control..."
                  className="w-full rounded border p-3"
                />
              </div>

              <div>
                <label htmlFor="request-description" className="mb-1 block text-sm font-medium">
                  Issue description
                </label>

                <textarea
                  id="request-description"
                  required
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  placeholder="Describe the problem"
                  rows={4}
                  className="w-full rounded border p-3"
                />
              </div>

              <div>
                <label htmlFor="request-priority" className="mb-1 block text-sm font-medium">
                  Priority
                </label>

                <select
                  id="request-priority"
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as Priority)
                  }
                  className="w-full rounded border p-3"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded bg-black p-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? "Creating..."
                  : "Create request"}
              </button>

              {message && (
                <p role="status" className="text-sm text-gray-700">
                  {message}
                </p>
              )}
            </form>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              My requests
            </h2>

            {loadError ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-white p-6">
                <p role="alert" className="text-sm text-red-700">{loadError}</p>
                <button type="button" onClick={retryLoad} className="mt-4 rounded border px-4 py-2">
                  Try again
                </button>
              </div>
            ) : requests.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed bg-white p-8">
                <p className="font-medium">
                  No service requests yet
                </p>

                <p className="mt-2 text-sm text-gray-600">
                  Create your first request using the form.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {requests.map((request) => (
                  <article
                    key={request.id}
                    className="rounded-xl bg-white p-5 shadow"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">
                          {request.system}
                        </h3>

                        <p className="text-sm text-gray-500">
                          {request.site}
                        </p>
                      </div>

                      <span className="rounded-full border px-3 py-1 text-sm">
                        {formatStatus(request.status)}
                      </span>
                    </div>

                    <p className="mt-4 text-gray-700">
                      {request.description}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500">
                      <span>
                        Priority: {request.priority}
                      </span>

                      <span>
                        {new Date(
                          request.created_at
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
