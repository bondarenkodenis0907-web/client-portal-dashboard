import { ContractEditorPage } from "@/components/portal/ContractEditorPage";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string; contractId: string }>;
  searchParams: Promise<{ draft?: string | string[] }>;
}) {
  return ContractEditorPage({ ...(await params), ...(await searchParams) });
}
