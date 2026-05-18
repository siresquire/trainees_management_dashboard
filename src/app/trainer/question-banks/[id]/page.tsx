import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import QuestionBankClient from "./QuestionBankClient";

export default async function QuestionBankDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["trainer", "quiz_creator", "super_admin"].includes(profile.role)) {
    redirect("/login");
  }

  // Fetch bank
  const { data: bank } = await supabase
    .from("question_banks")
    .select("id, name, description, level, tags, is_public, created_by, created_at, updated_at")
    .eq("id", id)
    .single();

  if (!bank) notFound();

  // Determine edit rights
  const isOwner = bank.created_by === user.id || profile.role === "super_admin";
  let canEdit = isOwner;

  if (!canEdit) {
    const { data: share } = await supabase
      .from("question_bank_shares")
      .select("can_edit")
      .eq("bank_id", id)
      .eq("shared_with", user.id)
      .maybeSingle();
    canEdit = share?.can_edit ?? false;
  }

  // Fetch questions
  const { data: questions } = await supabase
    .from("questions")
    .select("id, question_text, question_type, option_a, option_b, option_c, option_d, option_e, option_f, correct_answers, points, time_seconds, explanation, display_order")
    .eq("bank_id", id)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  // Fetch current shares (only owner can see)
  let shares: { id: string; shared_with: string; can_edit: boolean; profiles: { full_name: string } | null }[] = [];
  if (isOwner) {
    const { data: sharesRaw } = await supabase
      .from("question_bank_shares")
      .select("id, shared_with, can_edit")
      .eq("bank_id", id);

    if (sharesRaw?.length) {
      const sharedIds = sharesRaw.map((s) => s.shared_with);
      const { data: shareProfiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", sharedIds);

      const pMap = new Map((shareProfiles ?? []).map((p) => [p.id, p.full_name]));

      shares = sharesRaw.map((s) => ({
        ...s,
        profiles: pMap.has(s.shared_with) ? { full_name: pMap.get(s.shared_with)! } : null,
      }));
    }
  }

  // Cohorts the user has access to (for "Assign to Cohort")
  const { data: cohortAccess } = await supabase
    .from("cohort_access")
    .select("cohort_id, cohorts(id, name, level)")
    .eq("trainer_id", user.id);
  const accessibleCohorts = (cohortAccess ?? [])
    .map((ca) => {
      const c = ca.cohorts as { id: string; name: string; level: string } | null;
      return c ? { id: c.id, name: c.name, level: c.level } : null;
    })
    .filter(Boolean) as Array<{ id: string; name: string; level: string }>;

  return (
    <div className="p-4 md:p-8 max-w-5xl space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/trainer/question-banks"
        className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Question Banks
      </Link>

      <QuestionBankClient
        bank={bank}
        questions={questions ?? []}
        shares={shares}
        isOwner={isOwner}
        canEdit={canEdit}
        userId={user.id}
        cohorts={accessibleCohorts}
      />
    </div>
  );
}
