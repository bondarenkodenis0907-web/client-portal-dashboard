import type { Tables } from "./supabase/database.types";

// These text columns use SQL CHECK constraints, which generated types describe
// as strings. Validate them before passing data into the UI's finite states.
export type RequestStatus = "new" | "in_progress" | "closed";
export type RequestPriority = "low" | "medium" | "high";

type ServiceRequestRow = Tables<"service_requests">;
export type ServiceRequest = Omit<
  Pick<
    ServiceRequestRow,
    | "id"
    | "site"
    | "system"
    | "description"
    | "priority"
    | "status"
    | "assigned_to"
    | "resolution"
    | "created_at"
    | "updated_at"
    | "closed_at"
  >,
  "status" | "priority"
> & {
  status: RequestStatus;
  priority: RequestPriority;
};
export type ServiceRequestSummary = Pick<
  ServiceRequest,
  "id" | "site" | "system" | "status" | "priority" | "created_at"
>;
export type StaffMember = Pick<
  Tables<"service_staff">,
  "user_id" | "display_name" | "is_active"
>;
export type RequestEvent = Omit<
  Pick<
    Tables<"request_events">,
    "id" | "status" | "assigned_name" | "resolution" | "created_at"
  >,
  "status"
> & { status: RequestStatus };

export const requestColumns =
  "id, site, system, description, priority, status, assigned_to, resolution, created_at, updated_at, closed_at";

export function isRequestStatus(value: string): value is RequestStatus {
  return value === "new" || value === "in_progress" || value === "closed";
}

export function isRequestPriority(value: string): value is RequestPriority {
  return value === "low" || value === "medium" || value === "high";
}

export function parseRequestStatus(value: string): RequestStatus {
  if (!isRequestStatus(value)) {
    throw new Error("Unsupported request status.");
  }
  return value;
}

export function parseRequestPriority(value: string): RequestPriority {
  if (!isRequestPriority(value)) {
    throw new Error("Unsupported request priority.");
  }
  return value;
}

export function parseServiceRequest<
  T extends Pick<ServiceRequestRow, "status" | "priority">,
>(
  request: T,
): Omit<T, "status" | "priority"> &
  Pick<ServiceRequest, "status" | "priority"> {
  return {
    ...request,
    status: parseRequestStatus(request.status),
    priority: parseRequestPriority(request.priority),
  };
}

export function parseRequestEvent<
  T extends Pick<Tables<"request_events">, "status">,
>(event: T): Omit<T, "status"> & Pick<RequestEvent, "status"> {
  return { ...event, status: parseRequestStatus(event.status) };
}

export function formatRequestDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
