import type { ReactNode } from "react";
import { DashboardShell } from "@/components/portal/DashboardShell";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const membership = user ? await supabase.from("service_staff").select("user_id").eq("user_id", user.id).maybeSingle() : null;
  return <DashboardShell isStaff={Boolean(membership?.data)}>{children}</DashboardShell>;
}
