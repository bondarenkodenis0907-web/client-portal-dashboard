"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "sign-in" | "sign-up";

export default function LoginPage() {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const signingUp = mode === "sign-up";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const credentials = { email: email.trim(), password };
      const { data, error: authError } = signingUp
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);
      if (authError) {
        setError(authError.message);
      } else if (data.session) {
        router.replace("/dashboard");
        router.refresh();
      } else if (signingUp) {
        setNotice("Check your email for a confirmation link. After confirming, return here to sign in.");
        setPassword("");
        setMode("sign-in");
      } else {
        setError("Sign-in did not complete. Please try again.");
      }
    } catch {
      setError("Unable to connect. Check your connection and try again.");
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  function switchMode() {
    setMode(signingUp ? "sign-in" : "sign-up");
    setPassword("");
    setError("");
    setNotice("");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <section className="w-full max-w-md rounded-xl bg-white p-8 shadow" aria-labelledby="auth-title">
        <p className="text-sm text-gray-500">Client Portal</p>
        <h1 id="auth-title" className="mt-2 text-2xl font-bold">{signingUp ? "Create your account" : "Sign in"}</h1>
        <p className="mt-2 text-sm text-gray-600">
          {signingUp ? "Create an account to submit and track service requests." : "Access your profile and service requests."}
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4" aria-busy={loading}>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required
              value={email} onChange={(event) => setEmail(event.target.value)} disabled={loading}
              className="w-full rounded border p-3 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
            <input id="password" name="password" type="password"
              autoComplete={signingUp ? "new-password" : "current-password"} required
              value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading}
              className="w-full rounded border p-3 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full rounded bg-black p-3 text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? (signingUp ? "Creating account..." : "Signing in...") : (signingUp ? "Create account" : "Sign in")}
          </button>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="text-sm text-gray-700">{notice}</p>}
        </form>
        <button type="button" onClick={switchMode} disabled={loading}
          className="mt-4 w-full rounded border p-3 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
          {signingUp ? "Already have an account? Sign in" : "Need an account? Create one"}
        </button>
      </section>
    </main>
  );
}
