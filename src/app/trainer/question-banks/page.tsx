import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

const LEVEL_LABEL: Record<string, string> = {
  practitioner: "Practitioner",
  associate:    "Associate",
  devops:       "DevOps",
};

const LEVEL_COLOR: Record<string, string> = {
  practitioner: "bg-purple-100 text-purple-700",
  associate:    "bg-blue-100 text-blue-700",
  devops:       "bg-teal-100 text-teal-700",
};

export default async function QuestionBanksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["trainer", "quiz_creator", "super_admin"].includes(profile.role)) {
    redirect("/trainer/dashboard");
  }

  // Fetch own banks
  const { data: ownBanks } = await supabase
    .from("question_banks")
    .select("id, name, description, level, tags, is_public, created_at, updated_at")
    .eq("created_by", user.id)
    .order("updated_at", { ascending: false });

  // Fetch shared banks
  const { data: shares } = await supabase
    .from("question_bank_shares")
    .select("bank_id, can_edit, question_banks(id, name, description, level, tags, is_public, updated_at)")
    .eq("shared_with", user.id);

  const sharedBanks = (shares ?? [])
    .filter((s) => s.question_banks)
    .map((s) => ({
      ...(s.question_banks as {
        id: string; name: string; description: string | null;
        level: string | null; tags: string[] | null;
        is_public: boolean; updated_at: string;
      }),
      can_edit: s.can_edit,
    }));

  // Question counts per bank
  const allBankIds = [
    ...(ownBanks ?? []).map((b) => b.id),
    ...sharedBanks.map((b) => b.id),
  ];

  const countMap = new Map<string, number>();
  if (allBankIds.length) {
    const { data: counts } = await supabase
      .from("questions")
      .select("bank_id")
      .in("bank_id", allBankIds);

    for (const row of counts ?? []) {
      countMap.set(row.bank_id, (countMap.get(row.bank_id) ?? 0) + 1);
    }
  }

  const canCreate = ["trainer", "quiz_creator", "super_admin"].includes(profile.role);

  return (
    <div className="p-4 md:p-8 max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Question Banks</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Build and manage reusable question banks for quizzes and exams.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/trainer/question-banks/new"
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New bank
          </Link>
        )}
      </div>

      {/* My banks */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          My banks
          <span className="ml-2 text-slate-400 font-normal">({(ownBanks ?? []).length})</span>
        </h2>

        {!(ownBanks ?? []).length ? (
          <div className="bg-white border border-slate-200 rounded-2xl py-12 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">No question banks yet</p>
            {canCreate && (
              <Link
                href="/trainer/question-banks/new"
                className="mt-3 inline-flex text-sm font-medium text-orange-600 hover:text-orange-700"
              >
                Create your first bank →
              </Link>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(ownBanks ?? []).map((bank) => (
              <BankCard
                key={bank.id}
                bank={bank}
                questionCount={countMap.get(bank.id) ?? 0}
                badge="owner"
              />
            ))}
          </div>
        )}
      </section>

      {/* Shared with me */}
      {sharedBanks.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Shared with me
            <span className="ml-2 text-slate-400 font-normal">({sharedBanks.length})</span>
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sharedBanks.map((bank) => (
              <BankCard
                key={bank.id}
                bank={bank}
                questionCount={countMap.get(bank.id) ?? 0}
                badge={bank.can_edit ? "editor" : "viewer"}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BankCard({
  bank,
  questionCount,
  badge,
}: {
  bank: {
    id: string;
    name: string;
    description: string | null;
    level: string | null;
    tags: string[] | null;
    is_public: boolean;
    updated_at: string;
  };
  questionCount: number;
  badge: "owner" | "editor" | "viewer";
}) {
  const badgeCls = {
    owner:  "bg-orange-100 text-orange-700",
    editor: "bg-green-100 text-green-700",
    viewer: "bg-slate-100 text-slate-600",
  }[badge];

  return (
    <Link
      href={`/trainer/question-banks/${bank.id}`}
      className="group bg-white border border-slate-200 rounded-2xl p-5 hover:border-orange-300 hover:shadow-sm transition-all block"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-slate-900 group-hover:text-orange-700 transition-colors line-clamp-2">
          {bank.name}
        </h3>
        <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full capitalize ${badgeCls}`}>
          {badge}
        </span>
      </div>

      {bank.description && (
        <p className="text-xs text-slate-500 line-clamp-2 mb-3">{bank.description}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {bank.level && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${LEVEL_COLOR[bank.level] ?? "bg-slate-100 text-slate-600"}`}>
            {LEVEL_LABEL[bank.level] ?? bank.level}
          </span>
        )}
        {bank.is_public && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            Public
          </span>
        )}
        {(bank.tags ?? []).slice(0, 2).map((tag) => (
          <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {questionCount} question{questionCount !== 1 ? "s" : ""}
        </span>
        <span className="text-xs text-slate-400">
          {new Date(bank.updated_at).toLocaleDateString()}
        </span>
      </div>
    </Link>
  );
}
