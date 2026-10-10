
"use client";

import { type FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type AuthMode = "sign-in" | "sign-up";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 " +
  "text-sm text-slate-900 outline-none transition-colors " +
  "placeholder:text-slate-400 focus:border-blue-500 " +
  "focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50";

export default function LoginPage() {
  const router = useRouter();
  const [supabase] = useState(createClient);

  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
      const credentials = {
        email: email.trim(),
        password,
      };

      const { data, error: authError } = signingUp
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);

      if (authError) {
        setError(authError.message);
        return;
      }

      if (data.session) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      if (signingUp) {
        setNotice(
          "Check your email for a confirmation link. " +
          "After confirming your address, return here to sign in."
        );

        setPassword("");
        setShowPassword(false);
        setMode("sign-in");
      } else {
        setError(
          "Sign-in did not complete. Please try again."
        );
      }
    } catch {
      setError(
        "Unable to connect. Check your connection and try again."
      );
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  function switchMode() {
    setMode(signingUp ? "sign-in" : "sign-up");
    setPassword("");
    setShowPassword(false);
    setError("");
    setNotice("");
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-[#172238]">
      <div className="mx-auto grid min-h-screen max-w-[1200px] lg:grid-cols-[minmax(0,1fr)_470px]">

        {/* Product information */}

        <section className="hidden flex-col justify-between px-12 py-12 lg:flex xl:px-16">
          <Link href="/" className="inline-flex w-fit items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#315fd4] text-sm font-bold text-white">
              CP
            </span>

            <span>
              <span className="block text-sm font-semibold tracking-tight text-slate-900">
                Client Portal
              </span>

              <span className="block text-xs text-slate-500">
                Service workspace
              </span>
            </span>
          </Link>

          <div className="max-w-[450px] pb-12">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
              Technical service management
            </p>

            <h1 className="text-[42px] font-semibold leading-[1.16] tracking-[-0.04em] text-slate-900">
              Technical requests,
              <span className="block text-slate-500">
                in one place.
              </span>
            </h1>

            <p className="mt-6 max-w-[370px] text-base leading-7 text-slate-600">
              Report issues with building systems, follow
              their status and keep a record of previous
              service requests.
            </p>

            <div className="mt-10 border-l-2 border-blue-600 pl-5">
              <p className="text-sm font-semibold text-slate-900">
                Built for site and facility support
              </p>

              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                A structured way to report issues with
                CCTV, access control and other technical
                systems.
              </p>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5">
            <p className="text-xs text-slate-500">
              Site · System · Priority · Status
            </p>
          </div>
        </section>

        {/* Authentication form */}

        <section className="flex min-h-screen flex-col bg-white px-6 py-8 sm:px-10 lg:border-l lg:border-slate-200 lg:px-12">

          {/* Mobile branding */}

          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2.5 lg:hidden"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#315fd4] text-sm font-bold text-white">
              CP
            </span>

            <span className="text-sm font-semibold text-slate-900">
              Client Portal
            </span>
          </Link>

          <div className="flex flex-1 items-start pt-12 sm:pt-16 lg:items-center lg:pt-0">
            <div className="w-full">

              <div className="mb-9">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
                  Client access
                </p>

                <h2
                  id="auth-title"
                  className="text-[29px] font-semibold tracking-tight text-slate-900"
                >
                  {signingUp
                    ? "Create your account"
                    : "Welcome back"}
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {signingUp
                    ? "Create an account to submit and track service requests."
                    : "Sign in to manage your service requests."}
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                aria-labelledby="auth-title"
                aria-busy={loading}
                className="space-y-5"
              >
                <fieldset disabled={loading} className="space-y-5">

                  <div>
                    <label
                      htmlFor="auth-email"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Email address
                    </label>

                    <input
                      id="auth-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      value={email}
                      onChange={(event) =>
                        setEmail(event.target.value)
                      }
                      placeholder="you@company.com"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="auth-password"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Password
                    </label>

                    <div className="relative">
                      <input
                        id="auth-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={
                          signingUp
                            ? "new-password"
                            : "current-password"
                        }
                        required
                        value={password}
                        onChange={(event) =>
                          setPassword(event.target.value)
                        }
                        placeholder="Enter your password"
                        className={`${inputClass} pr-16`}
                      />

                      <button
                        type="button"
                        aria-label={
                          showPassword
                            ? "Hide password"
                            : "Show password"
                        }
                        aria-pressed={showPassword}
                        onClick={() =>
                          setShowPassword((current) => !current)
                        }
                        className="absolute inset-y-0 right-3 text-xs font-medium text-slate-500 hover:text-slate-900"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="flex w-full items-center justify-center rounded-lg bg-[#315fd4] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60"
                  >
                    {loading
                      ? signingUp
                        ? "Creating account..."
                        : "Signing in..."
                      : signingUp
                        ? "Create account"
                        : "Sign in"}
                  </button>

                </fieldset>

                {error && (
                  <p
                    role="alert"
                    className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    {error}
                  </p>
                )}

                {notice && (
                  <p
                    role="status"
                    className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800"
                  >
                    {notice}
                  </p>
                )}
              </form>

              <div className="mt-8 border-t border-slate-200 pt-6">
                <p className="text-center text-sm text-slate-600">
                  {signingUp
                    ? "Already have an account?"
                    : "New to Client Portal?"}

                  <button
                    type="button"
                    onClick={switchMode}
                    disabled={loading}
                    className="ml-2 font-semibold text-blue-700 hover:text-blue-800 disabled:opacity-50"
                  >
                    {signingUp
                      ? "Sign in"
                      : "Create an account"}
                  </button>
                </p>
              </div>
            </div>
          </div>

          <div className="pt-8 text-center">
            <Link
              href="/"
              className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-800"
            >
              Back to homepage
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
