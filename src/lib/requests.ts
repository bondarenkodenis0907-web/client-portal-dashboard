export type RequestStatus = "new" | "in_progress" | "closed";
export type ServiceRequest = {
  id: string;
  site: string;
  system: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: RequestStatus;
  assigned_to: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};
export type StaffMember = { user_id: string; display_name: string };
export type RequestEvent = {
  id: number;
  status: RequestStatus;
  assigned_name: string | null;
  resolution: string | null;
  created_at: string;
};
export const requestColumns = "id, site, system, description, priority, status, assigned_to, resolution, created_at, updated_at, closed_at";

export function formatRequestDate(value: string) {
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
