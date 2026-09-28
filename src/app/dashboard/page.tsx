"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  full_name: string | null;
  company: string | null;
  job_title: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      setEmail(user.email ?? "");

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, company, job_title")
        .eq("id", user.id)
        .single();

      if (!profileError && data) {
        setProfile(data);

        setFullName(data.full_name ?? "");
        setCompany(data.company ?? "");
        setJobTitle(data.job_title ?? "");
      }

      setLoading(false);
    }

    loadDashboard();
  }, [router, supabase]);

  async function handleSave() {
    setSaving(true);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("Unable to identify current user.");
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
      setMessage(error.message);
    } else {
      setProfile(data);
      setMessage("Profile saved.");
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
      <main className="flex min-h-screen items-center justify-center">
        <p>Loading dashboard...</p>
      </main>
    );
  }

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

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Account status</p>
            <p className="mt-2 text-xl font-semibold">Active</p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Company</p>
            <p className="mt-2 text-xl font-semibold">
              {profile?.company || "Not set"}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <p className="text-sm text-gray-500">Job title</p>
            <p className="mt-2 text-xl font-semibold">
              {profile?.job_title || "Not set"}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-white p-6 shadow">
          <h2 className="text-xl font-semibold">Edit profile</h2>

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
              className="rounded bg-black px-5 py-3 text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save profile"}
            </button>

            {message && (
              <p className="text-sm text-gray-700">
                {message}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}