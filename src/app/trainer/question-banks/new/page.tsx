import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import NewBankForm from "./NewBankForm";

export default async function NewQuestionBankPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["trainer", "quiz_creator", "super_admin"].includes(profile.role)) {
    redirect("/trainer/question-banks");
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <div className="mb-6">
        <Link
          href="/trainer/question-banks"
          className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Question Banks
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">New question bank</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Create a reusable bank of questions for quizzes and exams.
        </p>
      </div>

      <NewBankForm />
    </div>
  );
}
