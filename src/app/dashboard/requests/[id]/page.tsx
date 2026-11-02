import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RequestDetail } from "@/components/portal/RequestDetail";
import { isTransientAuthError } from "@/lib/auth-errors";
import { getRequestHistoryPage } from "@/lib/request-history";
import { requestColumns, parseServiceRequest } from "@/lib/requests";

export default async function RequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    notFound();
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (isTransientAuthError(authError))
    throw new Error(
      "Authentication is temporarily unavailable. Please try again.",
    );
  if (authError || !user) redirect("/login");
  const [request, events, staff] = await Promise.all([
    supabase
      .from("service_requests")
      .select(requestColumns)
      .eq("id", id)
      .maybeSingle(),
    getRequestHistoryPage(supabase, id),
    supabase
      .from("service_staff")
      .select("user_id, display_name, is_active")
      .order("display_name"),
  ]);
  if (request.error || staff.error)
    throw new Error("The request could not be loaded. Please try again.");
  if (!request.data) notFound();
  const members = staff.data ?? [];
  return (
    <RequestDetail
      key={request.data.id}
      request={parseServiceRequest(request.data)}
      history={events}
      staff={members}
      isStaff={members.some(
        (member) => member.user_id === user.id && member.is_active,
      )}
    />
  );
}
