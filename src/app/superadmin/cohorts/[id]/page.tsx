import { redirect } from "next/navigation";

export default async function SuperAdminCohortRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/trainer/cohorts/${id}`);
}
