"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function DashboardError({ reset }: { reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section className="rounded-xl border border-red-200 bg-white p-6">
      <h1 className="text-lg font-semibold">Unable to load this page</h1>
      <p role="alert" className="mt-2 text-sm text-slate-600">
        Check your connection and try again. Your saved requests have not been
        changed.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            router.refresh();
            reset();
          })
        }
        className="mt-5 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white"
      >
        {pending ? "Trying again..." : "Try again"}
      </button>
    </section>
  );
}
