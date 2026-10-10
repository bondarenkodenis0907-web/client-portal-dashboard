"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PortalIcon } from "@/components/portal/PortalIcon";
import { inputLimits } from "@/lib/input-limits";
import type { Tables } from "@/lib/supabase/database.types";

type Profile = Pick<Tables<"profiles">, "full_name" | "company" | "job_title">;

export default function SettingsPage() {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function loadProfile() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (
          !user ||
          userError?.status === 401 ||
          userError?.status === 403 ||
          userError?.name === "AuthSessionMissingError"
        ) {
          router.replace("/login");
          return;
        }
        if (userError) throw userError;
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
        setLoadError("");
      } catch {
        if (!cancelled)
          setLoadError(
            "Your profile could not be loaded. Check your connection and try again.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProfile();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [router, supabase, retryCount]);

  function retry() {
    setLoading(true);
    setLoadError("");
    setRetryCount((current) => current + 1);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    setSaveMessage("");
    setSaveError("");
    const input = {
      full_name: fullName.trim() || null,
      company: company.trim() || null,
      job_title: jobTitle.trim() || null,
    };
    if (
      Object.values(input).some(
        (value) => value !== null && value.length > inputLimits.profile,
      )
    ) {
      setSaveError("Each profile field must be 120 characters or fewer.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        setSaveError(
          "Your session could not be verified. Your changes are still in the form; try signing in again.",
        );
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .update({
          ...input,
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
      setSaveMessage("Profile saved successfully.");
    } catch {
      setSaveError(
        "Saving could not be confirmed. Your edits are still in the form; check your connection before retrying.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const emptyProfile =
    profile && !profile.full_name && !profile.company && !profile.job_title;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
          Settings
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Update your name, company and job title.
        </p>
      </div>

      {loading ? (
        <div
          role="status"
          aria-busy="true"
          className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white"
        >
          <span className="sr-only">Loading your profile...</span>
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-200 bg-white p-7">
          <h2 className="text-base font-semibold">
            Unable to load your profile
          </h2>
          <p role="alert" className="mt-2 text-sm text-red-700">
            {loadError}
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <PortalIcon name="refresh" />
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {emptyProfile && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              Add your name, company or job title below.
            </div>
          )}
          <section
            aria-labelledby="profile-heading"
            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
              <div className="flex items-center gap-2.5">
                <PortalIcon name="building" className="text-blue-700" />
                <h2
                  id="profile-heading"
                  className="text-base font-semibold text-slate-900"
                >
                  Profile information
                </h2>
              </div>
              <p className="mt-1.5 text-sm text-slate-500">
                These details are stored in your private account profile.
              </p>
            </div>
            <form onSubmit={saveProfile} className="px-5 py-6 sm:px-7">
              <fieldset disabled={saving} className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="settings-full-name"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
                  >
                    Full name
                  </label>
                  <input
                    id="settings-full-name"
                    type="text"
                    name="name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    autoComplete="name"
                    maxLength={inputLimits.profile}
                    placeholder="Your full name"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor="settings-company"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
                  >
                    Company
                  </label>
                  <input
                    id="settings-company"
                    type="text"
                    name="organization"
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                    autoComplete="organization"
                    maxLength={inputLimits.profile}
                    placeholder="Company name"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor="settings-job-title"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
                  >
                    Job title
                  </label>
                  <input
                    id="settings-job-title"
                    type="text"
                    name="organization-title"
                    value={jobTitle}
                    onChange={(event) => setJobTitle(event.target.value)}
                    autoComplete="organization-title"
                    maxLength={inputLimits.profile}
                    placeholder="Job title"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label
                    htmlFor="settings-email"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
                  >
                    Account email
                  </label>
                  <input
                    id="settings-email"
                    type="email"
                    value={email}
                    readOnly
                    className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">
                    Your sign-in email cannot be edited here.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 sm:col-span-2">
                  <div aria-live="polite">
                    {saveError && (
                      <p role="alert" className="text-xs text-red-700">
                        {saveError}
                      </p>
                    )}
                    {saveMessage && (
                      <p
                        role="status"
                        className="text-xs font-medium text-emerald-700"
                      >
                        {saveMessage}
                      </p>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-[#315fd4] px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-7">
            <div className="flex items-center gap-2.5">
              <PortalIcon name="shield" className="text-blue-700" />
              <h2 className="text-sm font-semibold text-slate-900">
                Account security
              </h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Your profile is private. The service team can view and process the
              requests you submit; other clients cannot access them.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Password and notification settings are not available in this
              version.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
