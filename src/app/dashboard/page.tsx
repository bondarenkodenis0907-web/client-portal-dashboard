"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  full_name: string | null;
  company: string | null;
  job_title: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
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

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, company, job_title")
        .eq("id", user.id)
        .single();

      if (cancelled) {
        return;
      }

      if (profileError) {
        setLoadError(profileError.message);
        setLoading(false);
        return;
      }

      setEmail(user.email ?? "");
      setProfile(data);

      setFullName(data.full_name ?? "");
      setCompany(data.company ?? "");
      setJobTitle(data.job_title ?? "");

      setLoading(false);
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [router, supabase, retryCount]);

  function handleRetry() {
    setLoading(true);
    setLoadError("");
    setRetryCount((current) => current + 1);
  }

  async function handleSave() {
    if (saving) {
      return;
    }

    setSaving(true);
    setSaveMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setSaveMessage("Unable to identify current user.");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        company: company.trim() || null,
        job_title: jobTitle.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("full_name, company, job_title")
      .single();

    if (error) {
      setSaveMessage(`Save failed: ${error.message}`);
    } else {
      setProfile(data);
      setSaveMessage("Profile saved.");
    }

    setSaving(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-xl bg-white p-8 shadow">
          <p className="text-lg font-medium">Loading dashboard...</p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow">
          <h1 className="text-2xl font-bold">
            Unable to load dashboard
          </h1>

          <p className="mt-3 text-sm text-red-700">
            {loadError}
          </p>

          <button
            onClick={handleRetry}
            className="mt-6 rounded bg-black px-5 py-3 text-white"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  const profileIsEmpty =
    !profile?.full_name &&
    !profile?.company &&
    !profile?.job_title;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="mt-1 text-gray-600">{email}</p>
          </div>

          <button
            onClick={handleSignOut}
            className="rounded bg-black px-4 py-2 text-white"
          >
            Sign out
          </button>
        </div>

        {profileIsEmpty && (
          <div className="mt-6 rounded-xl border border-dashed bg-white p-6">
            <h2 className="text-lg font-semibold">
              Your profile is empty
            </h2>

            <p className="mt-2 text-sm text-gray-600">
              Add your name, company and job title below.
            </p>
          </div>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">
              Account status
            </p>
            <p className="mt-2 text-xl font-semibold">
              Active
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">
              Company
            </p>
            <p className="mt-2 text-xl font-semibold">
              {profile?.company || "Not set"}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">
              Job title
            </p>
            <p className="mt-2 text-xl font-semibold">
              {profile?.job_title || "Not set"}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-white p-6 shadow">
          <h2 className="text-xl font-semibold">
            Edit profile
          </h2>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Full name
              </label>

              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded border p-3"
                placeholder="Your full name"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Company
              </label>

              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded border p-3"
                placeholder="Company name"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Job title
              </label>

              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full rounded border p-3"
                placeholder="Job title"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded bg-black px-5 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save profile"}
            </button>

            {saveMessage && (
              <p className="text-sm text-gray-700">
                {saveMessage}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}