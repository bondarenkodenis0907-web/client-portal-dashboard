export const maxContractBytes = 2 * 1024 * 1024;
export const managementBodyLimit = 3 * 1024 * 1024;
export const siteLimits = {
  name: 120,
  address: 300,
  customer_name: 160,
  contact_name: 120,
  contact_email: 200,
  contact_phone: 80,
} as const;
export const contractLimits = {
  number: 120,
  title: 160,
  customer: 160,
  provider: 160,
  starts_on: 10,
  ends_on: 10,
  state: 10,
  responsible_id: 36,
  notes: 2000,
} as const;
export type SiteDetails = Record<keyof typeof siteLimits, string> & {
  is_archived: boolean;
};
export type ContractDetails = Record<keyof typeof contractLimits, string>;
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function validRevision(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value < 2147483647
  );
}
export function validFields(value: unknown, limits: Record<string, number>) {
  return (
    record(value) &&
    Object.entries(limits).every(
      ([key, max]) =>
        typeof value[key] === "string" &&
        Array.from(value[key] as string).length <= max,
    )
  );
}
export function validContractPdf(filename: unknown, bytes: Uint8Array) {
  return (
    typeof filename === "string" &&
    Array.from(filename).length <= 120 &&
    filename.toLowerCase().endsWith(".pdf") &&
    !/[\\/\x00-\x1f\x7f]/.test(filename) &&
    bytes.length >= 5 &&
    bytes.length <= maxContractBytes &&
    new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
  );
}
export function contractDetails(
  value: unknown,
): ContractDetails & { responsible_name: string; author_name: string } {
  if (
    !validFields(value, contractLimits) ||
    !record(value) ||
    typeof value.responsible_name !== "string" ||
    typeof value.author_name !== "string"
  )
    throw Error("Contract details unavailable");
  return value as ContractDetails & {
    responsible_name: string;
    author_name: string;
  };
}
export async function managementBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > managementBodyLimit) {
        await reader.cancel();
        throw Error("Body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  ) as unknown;
}
