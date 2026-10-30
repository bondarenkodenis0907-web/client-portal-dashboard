import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StaffQueue } from "@/components/portal/StaffQueue";
import { getRequestPage } from "@/lib/request-pages";

export default async function StaffPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership, error } = await supabase
    .from("service_staff")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (error)
    throw new Error("The service queue could not be loaded. Please try again.");
  if (!membership) redirect("/dashboard");
  const [requests, staff] = await Promise.all([
    getRequestPage(supabase, { page: 0, search: "", status: "open" }),
    supabase
      .from("service_staff")
      .select("user_id, display_name, is_active")
      .order("display_name"),
  ]);
  if (staff.error)
    throw new Error("The service queue could not be loaded. Please try again.");
  return (
    <StaffQueue
      requests={requests.requests}
      total={requests.total}
      staff={staff.data ?? []}
    />
  );
}
