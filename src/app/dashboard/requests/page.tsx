"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
  const supabase = useMemo(() => createClient(), []);

  const [requests, setRequests] = useState<ServiceRequest[]>([]);

  const [site, setSite] = useState("");
  const [system, setSystem] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadRequests() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("service_requests")
        .select(
          "id, site, system, description, priority, status, created_at"
        )
        .order("created_at", { ascending: false });

      if (cancelled) {
        return;
      }

      if (error) {
        setMessage(`Unable to load requests: ${error.message}`);
      } else {
        setRequests((data ?? []) as ServiceRequest[]);
      }

      setLoading(false);
    }

    void loadRequests();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("Unable to identify current user.");
      setSubmitting(false);
      return;
    }

    const { data, error } = await supabase
      .from("service_requests")
      .insert({
        user_id: user.id,
        site: site.trim(),
        system: system.trim(),
        description: description.trim(),
        priority,
      })
      .select(
        "id, site, system, description, priority, status, created_at"
      )
      .single();

    if (error) {
      setMessage(`Unable to create request: ${error.message}`);
      setSubmitting(false);
      return;
    }

    setRequests((current) => [
      data as ServiceRequest,
      ...current,
    ]);

    setSite("");
    setSystem("");
    setDescription("");
    setPriority("medium");

    setMessage("Service request created.");
    setSubmitting(false);
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
                <label className="mb-1 block text-sm font-medium">
                  Site
                </label>

                <input
                  type="text"
                  value={site}
                  onChange={(event) => setSite(event.target.value)}
                  placeholder="Office, building or site"
                  className="w-full rounded border p-3"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  System
                </label>

                <input
                  type="text"
                  value={system}
                  onChange={(event) => setSystem(event.target.value)}
                  placeholder="CCTV, access control..."
                  className="w-full rounded border p-3"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Issue description
                </label>

                <textarea
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
                <label className="mb-1 block text-sm font-medium">
                  Priority
                </label>

                <select
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
                <p className="text-sm text-gray-700">
                  {message}
                </p>
              )}
            </form>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              My requests
            </h2>

            {requests.length === 0 ? (
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
