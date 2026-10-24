"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type SessionState = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const [supabase] = useState(createClient);
  const [state, setState] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (active) setState(!authError && data.user ? "ready" : "invalid");
    }).catch(() => {
      if (active) setState("invalid");
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || state !== "ready") return;
    setError("");
    if (password.length < 12) {
      setError("Use a password of at least 12 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    pending.current = true;
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError("Unable to change the password. Request a new link and try again.");
        return;
      }
      setPassword("");
      setConfirmation("");
      setComplete(true);
      // Require an explicit sign-in with the new password.
      await supabase.auth.signOut();
    } catch {
      setError("Unable to confirm the password change. Try signing in or request a new link.");
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-5 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <h1 className="text-[29px] font-semibold tracking-tight">Choose a new password</h1>
        {state === "checking" && <p role="status" className="mt-5 text-sm text-slate-600">Checking your reset link...</p>}
        {state === "invalid" && (
          <div className="mt-5 space-y-4">
            <p role="alert" className="text-sm text-red-700">Your reset link is invalid or expired.</p>
            <Link className="text-sm font-semibold text-blue-700 hover:underline" href="/forgot-password">Request another link</Link>
          </div>
        )}
        {complete && (
          <div className="mt-5 space-y-4">
            <p role="status" className="text-sm text-emerald-800">Password updated. Sign in with your new password.</p>
            <Link className="text-sm font-semibold text-blue-700 hover:underline" href="/login">Return to sign in</Link>
          </div>
        )}
        {state === "ready" && !complete && (
          <form onSubmit={handleSubmit} className="mt-7 space-y-5" aria-busy={loading}>
            <fieldset disabled={loading} className="space-y-5">
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-slate-700">New password</label>
                <input id="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700">Confirm new password</label>
                <input id="confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
                Show passwords
              </label>
              <button type="submit" disabled={loading} className="w-full rounded-lg bg-[#315fd4] px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {loading ? "Updating password..." : "Update password"}
              </button>
            </fieldset>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          </form>
        )}
        <Link href="/login" className="mt-7 inline-block text-sm font-semibold text-blue-700 hover:underline">Back to sign in</Link>
      </section>
    </main>
  );
}
