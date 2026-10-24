import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Confirm password reset | Client Portal",
  robots: { index: false, follow: false },
};

export default async function ConfirmRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string | string[] }>;
}) {
  const { token_hash: tokenHash } = await searchParams;
  const valid =
    typeof tokenHash === "string" && /^[A-Za-z0-9_-]{20,512}$/.test(tokenHash);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-5 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <h1 className="text-[29px] font-semibold tracking-tight">
          Confirm password reset
        </h1>
        {valid ? (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Continue to verify your reset link and choose a new password.
              Opening this page alone does not use the link.
            </p>
            <form method="post" action="/auth/verify-recovery" className="mt-7">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <button
                type="submit"
                className="w-full rounded-lg bg-[#315fd4] px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Continue password reset
              </button>
            </form>
          </>
        ) : (
          <p role="alert" className="mt-5 text-sm text-red-700">
            This reset link is invalid. Request another link.
          </p>
        )}
        <Link
          href="/forgot-password"
          className="mt-7 inline-block text-sm font-semibold text-blue-700 hover:underline"
        >
          Request a new link
        </Link>
      </section>
    </main>
  );
}
