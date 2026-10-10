import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RequestDetail } from "@/components/portal/RequestDetail";
import { requestColumns, type ServiceRequest, type StaffMember, type RequestEvent } from "@/lib/requests";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [request, events, staff] = await Promise.all([
    supabase.from("service_requests").select(requestColumns).eq("id", id).maybeSingle(),
    supabase.from("request_events").select("id, status, assigned_name, resolution, created_at").eq("request_id", id).order("id", { ascending: false }),
    supabase.from("service_staff").select("user_id, display_name").order("display_name"),
  ]);
  if (request.error || events.error || staff.error) throw new Error("The request could not be loaded. Please try again.");
  if (!request.data) notFound();
  const members = (staff.data ?? []) as StaffMember[];
  return <RequestDetail key={request.data.updated_at} request={request.data as ServiceRequest} events={(events.data ?? []) as RequestEvent[]} staff={members} isStaff={members.some((member) => member.user_id === user.id)} />;
}
