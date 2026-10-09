"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  full_name: string | null;
  company: string | null;
  job_title: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const [supabase] = useState(createClient);

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
  const [saveError, setSaveError] = useState("");
  const [signOutError, setSignOutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const savingRef = useRef(false);
  const signingOutRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadDashboard() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (cancelled) return;
        if (userError) {
          if (userError.status === 401 || userError.status === 403 || userError.name === "AuthSessionMissingError") {
            router.replace("/login");
            return;
          }
          throw userError;
        }
        if (!user) {
          router.replace("/login");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("full_name, company, job_title")
          .eq("id", user.id)
          .abortSignal(controller.signal)
          .single();
        if (cancelled) return;
        if (error || !data) throw error ?? new Error("Profile unavailable");

        setEmail(user.email ?? "");
        setProfile(data);
        setFullName(data.full_name ?? "");
        setCompany(data.company ?? "");
        setJobTitle(data.job_title ?? "");
      } catch {
        if (!cancelled) setLoadError("Your profile could not be loaded. Check your connection and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [router, supabase, retryCount]);

  function handleRetry() {
    setLoading(true);
    setLoadError("");
    setRetryCount((current) => current + 1);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || signingOutRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveMessage("");
    setSaveError("");

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setSaveError("Your session could not be verified. Check your connection or sign in again; your changes are still in the form.");
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
      if (error || !data) throw error ?? new Error("Save not confirmed");
      setProfile(data);
      setFullName(data.full_name ?? "");
      setCompany(data.company ?? "");
      setJobTitle(data.job_title ?? "");
      setSaveMessage("Profile saved.");
    } catch {
      setSaveError("Saving could not be confirmed. Your changes are still in the form; check your connection and try saving again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleSignOut() {
    if (signingOutRef.current || savingRef.current) return;
    signingOutRef.current = true;
    setSigningOut(true);
    setSignOutError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch {
      setSignOutError("Sign-out could not be confirmed. Please try again.");
    } finally {
      signingOutRef.current = false;
      setSigningOut(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-xl bg-white p-8 shadow">
          <p role="status" className="text-lg font-medium">Loading your profile...</p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow">
          <h1 className="text-2xl font-bold">
            Unable to load your profile
          </h1>

          <p role="alert" className="mt-3 text-sm text-red-700">
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="mt-1 text-gray-600">{email}</p>
          </div>

          <button
            onClick={handleSignOut}
            disabled={signingOut || saving}
            className="rounded bg-black px-4 py-2 text-white"
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>

        {signOutError && <p role="alert" className="mt-4 text-sm text-red-700">{signOutError}</p>}

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
              Full name
            </p>

            <p className="mt-2 text-xl font-semibold">
              {profile?.full_name || "Not set"}
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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">
                Service Requests
              </h2>

              <p className="mt-2 text-sm text-gray-600">
                Report a technical issue and track your requests.
              </p>
            </div>

            <Link
              href="/dashboard/requests"
              className="rounded bg-black px-5 py-3 text-white"
            >
              Open requests
            </Link>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-white p-6 shadow">
          <h2 className="text-xl font-semibold">
            Edit profile
          </h2>

          <form onSubmit={handleSave} className="mt-5">
            <fieldset disabled={saving || signingOut} className="space-y-4">
            <div>
              <label htmlFor="profile-name" className="mb-1 block text-sm font-medium">
                Full name
              </label>

              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded border p-3"
                id="profile-name"
                name="profile-name"
                autoComplete="name"
                placeholder="Your full name"
              />
            </div>

            <div>
              <label htmlFor="profile-company" className="mb-1 block text-sm font-medium">
                Company
              </label>

              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded border p-3"
                id="profile-company"
                name="profile-company"
                autoComplete="organization"
                placeholder="Company name"
              />
            </div>

            <div>
              <label htmlFor="profile-job-title" className="mb-1 block text-sm font-medium">
                Job title
              </label>

              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full rounded border p-3"
                id="profile-job-title"
                name="profile-job-title"
                autoComplete="organization-title"
                placeholder="Job title"
              />
            </div>

            <button
              type="submit"
              disabled={saving || signingOut}
              className="rounded bg-black px-5 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save profile"}
            </button>

            </fieldset>

            {saveError && <p role="alert" className="mt-4 text-sm text-red-700">{saveError}</p>}

            {saveMessage && (
              <p role="status" className="mt-4 text-sm text-gray-700">
                {saveMessage}
              </p>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}
