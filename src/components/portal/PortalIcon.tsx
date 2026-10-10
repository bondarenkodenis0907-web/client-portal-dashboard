import type { ReactNode } from "react";

export type PortalIconName =
  | "dashboard"
  | "requests"
  | "projects"
  | "tasks"
  | "files"
  | "settings"
  | "menu"
  | "close"
  | "plus"
  | "arrow-right"
  | "logout"
  | "clock"
  | "check"
  | "alert"
  | "activity"
  | "building"
  | "shield"
  | "refresh"
  | "search";

const paths: Record<PortalIconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  requests: (
    <>
      <path d="M8 4h10a2 2 0 0 1 2 2v14H4V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2.5" width="8" height="4" rx="1" />
      <path d="M8 11h8M8 15h8" />
    </>
  ),
  projects: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 7h2m4 0h0M9 11h2m4 0h0M9 15h2m4 0h0M10 21v-3h4v3" />
    </>
  ),
  tasks: (
    <>
      <path d="m4 7 2 2 3-3M12 8h8M4 16l2 2 3-3M12 17h8" />
    </>
  ),
  files: (
    <>
      <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z" />
      <path d="M13 3v7h7M8 15h8M8 18h5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l-1.8 1.8a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6h-2.6a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-1.8-1.8A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.6-1H5v-2.6a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l1.8-1.8a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6h2.6a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l1.8 1.8a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1V14a1.7 1.7 0 0 0-1.6 1z" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M5 5l14 14M19 5 5 19" />,
  plus: <path d="M12 5v14M5 12h14" />,
  "arrow-right": <path d="M5 12h14m-6-6 6 6-6 6" />,
  logout: (
    <>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M14 8l4 4-4 4M8 12h10" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  ),
  alert: (
    <>
      <path d="m12 3 10 18H2L12 3z" />
      <path d="M12 9v5m0 3h.01" />
    </>
  ),
  activity: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  building: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-4h4v4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2 20 5v6c0 5-3.5 8-8 11-4.5-3-8-6-8-11V5z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M5.6 9a7 7 0 0 1 12-2L20 12M4 12l2.4 5a7 7 0 0 0 12-2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4.5 4.5" />
    </>
  ),
};

export function PortalIcon({
  name,
  className = "",
}: {
  name: PortalIconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-[18px] w-[18px] shrink-0 ${className}`}
    >
      {paths[name]}
    </svg>
  );
}
