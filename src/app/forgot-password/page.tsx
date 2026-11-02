"use client";

import { type FormEvent, Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function ForgotPasswordForm() {
  const invalidLink = useSearchParams().get("status") === "invalid";
  const [supabase] = useState(createClient);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      const redirectTo = new URL("/auth/callback", window.location.origin);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: redirectTo.toString() },
      );
      if (resetError) {
        setError("Unable to send the request. Please try again later.");
        return;
      }
      // Do not reveal whether a Supabase Auth user exists.
      setSent(true);
    } catch {
      setError("Unable to connect. Check your connection and try again.");
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-5 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <Link
          href="/login"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Back to sign in
        </Link>
        <h1 className="mt-7 text-[29px] font-semibold tracking-tight">
          Reset your password
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Enter your account email to request a password reset link.
        </p>
        {invalidLink && (
          <p role="alert" className="mt-5 text-sm text-red-700">
            This reset link is invalid or expired. Request another link.
          </p>
        )}
        {sent ? (
          <p
            role="status"
            className="mt-7 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900"
          >
            If an account exists for this email, you will receive a password
            reset link.
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-7 space-y-5"
            aria-busy={loading}
          >
            <fieldset disabled={loading} className="space-y-5">
              <div>
                <label
                  htmlFor="recovery-email"
                  className="block text-sm font-medium text-slate-700"
                >
                  Email address
                </label>
                <input
                  id="recovery-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#315fd4] px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </fieldset>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
          </form>
        )}
      </section>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<p role="status">Loading password recovery...</p>}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
