import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 px-6 py-16">
      <div className="mx-auto flex min-h-[75vh] max-w-5xl items-center">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
            Client Portal
          </p>

          <h1 className="mt-4 text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Report a technical issue
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-600">
            Tell us which building or site is affected, choose the system and
            priority, and describe the problem. Your account keeps the request
            details and status together.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/login"
              className="rounded-lg bg-black px-6 py-3 font-medium text-white transition hover:opacity-80"
            >
              Sign in to submit a request
            </Link>

            <Link
              href="/dashboard/requests"
              className="rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-900 transition hover:bg-gray-100"
            >
              View my requests
            </Link>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold">Site and system</h2>
              <p className="mt-2 text-sm text-gray-600">
                Identify the location and the equipment affected.
              </p>
            </div>

            <div className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold">Problem and priority</h2>
              <p className="mt-2 text-sm text-gray-600">
                Describe what happened and select how urgent it is.
              </p>
            </div>

            <div className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold">Request history</h2>
              <p className="mt-2 text-sm text-gray-600">
                Return to your submitted requests and view their status.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
