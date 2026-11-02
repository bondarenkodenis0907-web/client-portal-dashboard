"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SiteDetails, ContractDetails } from "@/lib/contract-policy";
import {
  siteLimits,
  contractLimits,
  maxContractBytes,
} from "@/lib/contract-policy";
const input =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-50";
async function save(body: unknown) {
  const r = await fetch("/api/facility/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {
    throw Error(
      "Save result is not confirmed. Reload saved details before retrying.",
    );
  });
  const data = await r.json().catch(() => {
    throw Error(
      "Save result is not confirmed. Reload saved details before retrying.",
    );
  });
  if (!r.ok || data.saved !== true)
    throw Error(data.message || "Save is not confirmed. Reload saved details.");
}
function SaveState({ pending, error }: { pending: boolean; error: string }) {
  return (
    <>
      <button
        disabled={pending || !!error}
        className="mt-6 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error} Keep a copy of your changes before reloading.
        </p>
      )}
    </>
  );
}
function Reload({ error }: { error: string }) {
  return error ? (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="ml-4 text-sm font-medium text-blue-700"
    >
      Reload saved details
    </button>
  ) : null;
}
const siteLabels: Record<keyof typeof siteLimits, string> = {
  name: "Site name",
  address: "Address",
  customer_name: "Customer",
  contact_name: "Contact name",
  contact_email: "Contact email",
  contact_phone: "Contact phone",
};
export function SiteForm({
  id,
  revision,
  initial,
}: {
  id: string;
  revision: number;
  initial: SiteDetails;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || error) return;
    const f = new FormData(e.currentTarget);
    const details: Record<string, string | boolean> = {
      is_archived: f.get("is_archived") === "on",
    };
    for (const k of Object.keys(siteLimits))
      details[k] = String(f.get(k) || "").trim();
    setPending(true);
    try {
      await save({ action: "site", id, revision, details });
      router.push(`/dashboard/sites/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save is not confirmed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      onChange={() => setError("")}
      className="mt-6 rounded-xl border border-slate-200 bg-white p-6"
    >
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
        {Object.entries(siteLabels).map(([k, label]) => (
          <label key={k} className="text-sm font-medium">
            {label}
            <input
              name={k}
              className={input}
              type={k === "contact_email" ? "email" : "text"}
              defaultValue={initial[k as keyof typeof siteLabels]}
              required={k === "name"}
              maxLength={siteLimits[k as keyof typeof siteLimits]}
            />
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_archived"
            defaultChecked={initial.is_archived}
          />
          Archived — keep buildings and service history
        </label>
      </fieldset>
      <SaveState pending={pending} error={error} />
      <Reload error={error} />
    </form>
  );
}
const contractLabels: Record<keyof typeof contractLimits, string> = {
  number: "Contract number",
  title: "Contract title",
  customer: "Customer",
  provider: "Service provider",
  starts_on: "Starts on",
  ends_on: "Ends on",
  state: "Status",
  responsible_id: "Responsible staff",
  notes: "Published note",
};
async function pdfBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(Error("Could not read the PDF."));
    r.onload = () =>
      typeof r.result === "string"
        ? resolve(r.result.split(",")[1])
        : reject(Error("Could not read the PDF."));
    r.readAsDataURL(file);
  });
}
export function ContractForm({
  id,
  siteId,
  versionId,
  revision,
  initial,
  staff,
}: {
  id: string;
  siteId: string;
  versionId: string;
  revision: number;
  initial: ContractDetails;
  staff: { user_id: string; display_name: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || error) return;
    const f = new FormData(e.currentTarget);
    const file = f.get("pdf");
    if (
      !(file instanceof File) ||
      file.size > maxContractBytes ||
      file.size < 5
    ) {
      setError("Choose a PDF up to 2 MiB.");
      return;
    }
    const details: Record<string, string> = {};
    for (const k of Object.keys(contractLimits))
      details[k] = String(f.get(k) || "").trim();
    setPending(true);
    try {
      await save({
        action: "contract",
        id,
        site_id: siteId,
        version_id: versionId,
        revision,
        details,
        filename: file.name,
        pdf_base64: await pdfBase64(file),
      });
      router.push(`/dashboard/sites/${siteId}/contracts/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save is not confirmed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      onChange={() => setError("")}
      className="mt-6 rounded-xl border border-slate-200 bg-white p-6"
    >
      <p className="mb-6 text-sm text-slate-500">
        Each save creates a version with its own PDF. Client access changes only
        when you explicitly publish a version.
      </p>
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
        {Object.entries(contractLabels).map(([k, label]) => (
          <label
            key={k}
            className={`text-sm font-medium ${k === "notes" ? "sm:col-span-2" : ""}`}
          >
            {label}
            {k === "responsible_id" ? (
              <select
                name={k}
                defaultValue={initial.responsible_id}
                className={input}
                required
              >
                <option value="">Select staff</option>
                {staff.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.display_name}
                  </option>
                ))}
              </select>
            ) : k === "state" ? (
              <select name={k} defaultValue={initial.state} className={input}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="ended">Ended</option>
              </select>
            ) : k === "notes" ? (
              <textarea
                name={k}
                defaultValue={initial.notes}
                className={input}
                rows={3}
                maxLength={2000}
              />
            ) : (
              <input
                name={k}
                type={k.endsWith("_on") ? "date" : "text"}
                defaultValue={initial[k as keyof ContractDetails]}
                className={input}
                required={k !== "ends_on"}
                maxLength={contractLimits[k as keyof typeof contractLimits]}
              />
            )}
          </label>
        ))}
        <label className="text-sm font-medium sm:col-span-2">
          Contract PDF
          <input
            type="file"
            name="pdf"
            accept=".pdf,application/pdf"
            required
            className={input}
          />
          <span className="mt-1 block text-xs text-slate-500">
            PDF, up to 2 MiB. Previous versions remain available to the
            responsible team.
          </span>
        </label>
      </fieldset>
      <SaveState pending={pending} error={error} />
      <Reload error={error} />
    </form>
  );
}
export function PublishVersion({
  id,
  revision,
  versionId,
  label,
}: {
  id: string;
  revision: number;
  versionId: string | null;
  label: string;
}) {
  const router = useRouter();
  const [ack, setAck] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ack || pending || error) return;
        setPending(true);
        try {
          await save({
            action: "publish",
            id,
            revision,
            version_id: versionId,
          });
          router.refresh();
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Publication is not confirmed.",
          );
        } finally {
          setPending(false);
        }
      }}
      className="mt-4 border-t border-slate-100 pt-4"
    >
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
          disabled={pending}
          className="mt-1"
        />
        {versionId
          ? "Allow admitted site clients to read these details and download this PDF."
          : "Remove client access to the currently published version."}
      </label>
      <button
        disabled={!ack || pending || !!error}
        className="mt-3 rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <Reload error={error} />
    </form>
  );
}
