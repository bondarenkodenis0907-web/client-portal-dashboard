import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 px-6 py-16">
      <div className="mx-auto flex min-h-[75vh] max-w-5xl items-center">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
            Secure Client Portal
          </p>

          <h1 className="mt-4 text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Client Portal Dashboard
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-600">
            Secure client account with authentication, profile management,
            protected routes and user-level data isolation powered by Next.js
            and Supabase.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/login"
              className="rounded-lg bg-black px-6 py-3 font-medium text-white transition hover:opacity-80"
            >
              Sign In
            </Link>

            <Link
              href="/dashboard"
              className="rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-900 transition hover:bg-gray-100"
            >
              Open Dashboard
            </Link>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-white p-5">
              <p className="text-sm text-gray-500">Authentication</p>
              <p className="mt-2 font-semibold">Supabase Auth</p>
            </div>

            <div className="rounded-xl border bg-white p-5">
              <p className="text-sm text-gray-500">Data Security</p>
              <p className="mt-2 font-semibold">Row Level Security</p>
            </div>

            <div className="rounded-xl border bg-white p-5">
              <p className="text-sm text-gray-500">Deployment</p>
              <p className="mt-2 font-semibold">Vercel</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
