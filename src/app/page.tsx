import Link from "next/link";

const reportingSteps = [
  {
    number: "01",
    title: "Identify the location",
    description:
      "Specify the building or site and the technical system affected.",
  },
  {
    number: "02",
    title: "Describe the problem",
    description: "Explain what happened and select the appropriate priority.",
  },
  {
    number: "03",
    title: "Follow the request",
    description:
      "Return to your account to check its status and request history.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#172238]">
      {/* Navigation */}

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-[76px] max-w-[1200px] items-center justify-between gap-4 px-6 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-3">
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

          <nav
            aria-label="Main navigation"
            className="flex items-center gap-5 sm:gap-8"
          >
            <a
              href="#how-it-works"
              className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 sm:inline"
            >
              How it works
            </a>

            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}

        <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-6 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-20 lg:py-28">
          <div className="max-w-[590px]">
            <div className="mb-7 flex items-center gap-3">
              <span className="h-px w-8 bg-[#315fd4]" />

              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                Technical service portal
              </p>
            </div>

            <h1 className="max-w-[590px] text-[40px] font-semibold leading-[1.12] tracking-[-0.045em] text-slate-900 sm:text-[52px] lg:text-[58px]">
              Report technical issues.
              <span className="mt-2 block text-slate-500">
                Track their status.
              </span>
            </h1>

            <p className="mt-7 max-w-[470px] text-base leading-8 text-slate-600">
              A central place to report problems with CCTV, access control, fire
              alarms and other building systems.
            </p>

            <p className="mt-4 max-w-[470px] text-sm leading-7 text-slate-500">
              Submit a service request, set its priority and access your request
              history whenever you need it.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg bg-[#315fd4] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Sign in to submit a request
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="ml-2 h-4 w-4"
                >
                  <path d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </Link>

              <Link
                href="/dashboard/requests"
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                View my requests
              </Link>
            </div>

            <p className="mt-5 text-xs text-slate-500">
              Your request history is accessible through your account.
            </p>
          </div>

          {/* Example request */}

          <aside
            aria-label="Example service request"
            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  Example request
                </p>

                <h2 className="mt-2 text-base font-semibold text-slate-900">
                  Camera connection issue
                </h2>
              </div>

              <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                New
              </span>
            </div>

            <div className="px-6 py-6">
              <div className="grid grid-cols-2 gap-x-5 gap-y-6">
                <div>
                  <p className="text-xs text-slate-500">Location</p>

                  <p className="mt-2 text-sm font-medium text-slate-900">
                    Office — Floor 2
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">System</p>

                  <p className="mt-2 text-sm font-medium text-slate-900">
                    CCTV
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Priority</p>

                  <div className="mt-2">
                    <span className="inline-flex rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                      High
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Status</p>

                  <p className="mt-2 text-sm font-medium text-slate-900">
                    Awaiting review
                  </p>
                </div>
              </div>

              <div className="mt-7 border-t border-slate-100 pt-6">
                <p className="text-xs font-medium text-slate-500">
                  Issue description
                </p>

                <p className="mt-3 text-sm leading-7 text-slate-700">
                  Camera 12 is offline and does not respond to network checks.
                  Connection requires inspection.
                </p>
              </div>

              <div className="mt-7 border-l-2 border-blue-600 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium leading-5 text-slate-600">
                  Site, system, description and priority are recorded together
                  with every request.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
              <p className="text-xs text-slate-500">
                Illustrative example — not live account data
              </p>
            </div>
          </aside>
        </section>

        {/* How it works */}

        <section
          id="how-it-works"
          aria-labelledby="process-title"
          className="scroll-mt-12 border-y border-slate-200 bg-white"
        >
          <div className="mx-auto grid max-w-[1200px] gap-10 px-6 py-16 sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20 lg:py-20">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                Reporting process
              </p>

              <h2
                id="process-title"
                className="mt-4 text-[28px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-[32px]"
              >
                A clear record of every issue.
              </h2>

              <p className="mt-5 max-w-[360px] text-sm leading-7 text-slate-600">
                Each request contains the information needed to identify the
                affected system and understand the reported problem.
              </p>
            </div>

            <ol className="divide-y divide-slate-200 border-t border-slate-200">
              {reportingSteps.map((step) => (
                <li key={step.number} className="flex gap-5 py-6">
                  <span className="w-9 shrink-0 pt-0.5 text-sm font-semibold text-blue-700">
                    {step.number}
                  </span>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      {step.title}
                    </h3>

                    <p className="mt-2 max-w-[440px] text-sm leading-7 text-slate-600">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Supported use cases */}

        <section className="mx-auto max-w-[1200px] px-6 py-16 sm:px-8 lg:py-20">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                Use cases
              </p>

              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
                Built around technical service requests.
              </h2>

              <p className="mt-3 max-w-[600px] text-sm leading-7 text-slate-600">
                The request form accepts different building systems and site
                locations.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-2.5">
            {[
              "Video surveillance",
              "Access control",
              "Fire alarm systems",
              "Network equipment",
              "Building systems",
            ].map((system) => (
              <span
                key={system}
                className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
              >
                {system}
              </span>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-4 px-6 py-7 sm:flex-row sm:items-center sm:px-8">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Client Portal
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Technical service requests and tracking
            </p>
          </div>

          <Link
            href="/login"
            className="text-sm font-medium text-slate-600 transition-colors hover:text-blue-700"
          >
            Access your account
          </Link>
        </div>
      </footer>
    </div>
  );
}
