import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StaffQueue } from "@/components/portal/StaffQueue";
import { requestColumns, type ServiceRequest, type StaffMember } from "@/lib/requests";

export default async function StaffPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership, error } = await supabase.from("service_staff").select("user_id").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error("The service queue could not be loaded. Please try again.");
  if (!membership) redirect("/dashboard");
  const [requests, staff] = await Promise.all([
    supabase.from("service_requests").select(requestColumns).order("created_at", { ascending: false }),
    supabase.from("service_staff").select("user_id, display_name").order("display_name"),
  ]);
  if (requests.error || staff.error) throw new Error("The service queue could not be loaded. Please try again.");
  return <StaffQueue requests={(requests.data ?? []) as ServiceRequest[]} staff={(staff.data ?? []) as StaffMember[]} />;
}
