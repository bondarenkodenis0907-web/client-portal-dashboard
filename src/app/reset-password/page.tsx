"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { validPassword } from "@/lib/recovery-policy";

type State =
  | "checking"
  | "check_failed"
  | "ready"
  | "invalid"
  | "updated_logout_pending"
  | "complete"
  | "unknown";

export default function ResetPasswordPage() {
  const [state, setState] = useState<State>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/auth/recovery-session", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Session check unavailable");
        return (await response.json()).ready;
      })
      .then((ready) => {
        if (!controller.signal.aborted) setState(ready ? "ready" : "invalid");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("check_failed");
      });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || state !== "ready") return;
    setError("");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    if (!validPassword(password, confirmation)) {
      setError(
        Array.from(password).length < 12
          ? "Use a password of at least 12 characters."
          : "That password is too long. Use a shorter one.",
      );
      return;
    }
    pending.current = true;
    setLoading(true);
    try {
      const response = await fetch("/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmation }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (
        result.state === "complete" ||
        result.state === "updated_logout_pending"
      ) {
        setPassword("");
        setConfirmation("");
        setState(result.state);
      } else if (result.state === "invalid_session") {
        setPassword("");
        setConfirmation("");
        setState("invalid");
      } else if (result.state === "unknown") {
        setPassword("");
        setConfirmation("");
        setState("unknown");
      } else
        setError(
          "Unable to change the password. Try again or request a new link.",
        );
    } catch {
      setPassword("");
      setConfirmation("");
      setState("unknown");
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  async function finishSignOut() {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/auth/finish-recovery", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (response.ok && result.complete) setState("complete");
      else setError("Could not confirm sign-out. Please try again.");
    } catch {
      setError(
        "Could not confirm sign-out. Check your connection and try again.",
      );
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-5 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <h1 className="text-[29px] font-semibold tracking-tight">
          Choose a new password
        </h1>
        {state === "checking" && (
          <p role="status" className="mt-5">
            Checking your reset link...
          </p>
        )}
        {state === "check_failed" && (
          <div className="mt-5 space-y-4">
            <p role="alert">
              Could not check your reset link. Check your connection and try
              again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-blue-700 underline"
            >
              Try again
            </button>
          </div>
        )}
        {state === "invalid" && (
          <div className="mt-5 space-y-4">
            <p role="alert">
              Your reset link is invalid or expired. Request a fresh link to
              continue.
            </p>
            <Link href="/forgot-password" className="text-blue-700 underline">
              Request another link
            </Link>
          </div>
        )}
        {state === "complete" && (
          <p role="status" className="mt-5 text-emerald-800">
            Password updated. Sign-out confirmed. Sign in with your new
            password.
          </p>
        )}
        {state === "updated_logout_pending" && (
          <div className="mt-5 space-y-4">
            <p role="status">
              Password updated. Sign-out could not be confirmed.
            </p>
            <button
              type="button"
              onClick={finishSignOut}
              disabled={loading}
              className="rounded-lg bg-blue-700 px-4 py-3 text-white disabled:opacity-60"
            >
              {loading ? "Signing out..." : "Finish signing out"}
            </button>
          </div>
        )}
        {state === "unknown" && (
          <div className="mt-5 space-y-4">
            <p role="alert">
              Could not confirm whether your password changed. Try signing in,
              or request a new link before another password change.
            </p>
            <Link href="/forgot-password" className="text-blue-700 underline">
              Request another link
            </Link>
          </div>
        )}
        {state === "ready" && (
          <form
            onSubmit={submit}
            aria-busy={loading}
            className="mt-7 space-y-5"
          >
            <fieldset disabled={loading} className="space-y-5">
              <div>
                <label
                  htmlFor="new-password"
                  className="block text-sm font-medium"
                >
                  New password
                </label>
                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={72}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3.5 py-3"
                />
              </div>
              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-sm font-medium"
                >
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={72}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3.5 py-3"
                />
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(event) => setShowPassword(event.target.checked)}
                />
                Show passwords
              </label>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
              >
                {loading ? "Updating password..." : "Update password"}
              </button>
            </fieldset>
          </form>
        )}
        {error && (
          <p role="alert" className="mt-5 text-sm text-red-700">
            {error}
          </p>
        )}
        <Link
          href="/login"
          className="mt-7 inline-block text-sm font-semibold text-blue-700 hover:underline"
        >
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
