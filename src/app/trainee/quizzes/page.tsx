import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function TraineeQuizzesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Trainee record
  const { data: trainee } = await supabase
    .from("trainees")
    .select("id, cohort_id, full_name")
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .single();

  if (!trainee) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-slate-900 mb-2">My Quizzes</h1>
        <p className="text-slate-500 text-sm">You are not currently enrolled in a cohort.</p>
      </div>
    );
  }

  // Quiz assignments for this cohort
  const { data: assignments } = await supabase
    .from("quiz_assignments")
    .select("id, title, mode, questions_per_student, time_limit_mins, attempts_allowed, open_at, close_at, show_results, created_at")
    .eq("cohort_id", trainee.cohort_id)
    .order("created_at", { ascending: false });

  // My attempts
  const assignmentIds = (assignments ?? []).map((a) => a.id);
  let myAttempts: Array<{
    id: string;
    assignment_id: string;
    attempt_no: number;
    submitted_at: string | null;
    final_score: number | null;
    started_at: string;
  }> = [];

  if (assignmentIds.length) {
    const { data: attempts } = await supabase
      .from("quiz_attempts")
      .select("id, assignment_id, attempt_no, submitted_at, final_score, started_at")
      .eq("trainee_id", trainee.id)
      .in("assignment_id", assignmentIds)
      .order("started_at", { ascending: false });
    myAttempts = attempts ?? [];
  }

  // Build a map of assignmentId → best submitted attempt
  const attemptsByAssignment = new Map<string, typeof myAttempts>();
  for (const a of myAttempts) {
    const existing = attemptsByAssignment.get(a.assignment_id) ?? [];
    existing.push(a);
    attemptsByAssignment.set(a.assignment_id, existing);
  }

  type AssignmentRow = NonNullable<typeof assignments>[number];

  const now = new Date();

  function quizStatus(a: AssignmentRow) {
    if (!a) return "closed";
    if (a.close_at && new Date(a.close_at) < now) return "closed";
    if (a.open_at && new Date(a.open_at) > now) return "upcoming";
    return "open";
  }

  const openQuizzes = (assignments ?? []).filter((a) => quizStatus(a) === "open");
  const upcomingQuizzes = (assignments ?? []).filter((a) => quizStatus(a) === "upcoming");
  const closedQuizzes = (assignments ?? []).filter((a) => quizStatus(a) === "closed");

  function fmtDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function AttemptsInfo({ assignmentId, allowed }: { assignmentId: string; allowed: number }) {
    const attempts = attemptsByAssignment.get(assignmentId) ?? [];
    const submitted = attempts.filter((a) => a.submitted_at);
    const inProgress = attempts.find((a) => !a.submitted_at);
    return (
      <span className="text-xs text-slate-500">
        {submitted.length}/{allowed} attempt{allowed !== 1 ? "s" : ""} used
        {inProgress ? " · In progress" : ""}
      </span>
    );
  }

  function BestScore({ assignmentId }: { assignmentId: string }) {
    const attempts = attemptsByAssignment.get(assignmentId) ?? [];
    const submitted = attempts.filter((a) => a.submitted_at && a.final_score != null);
    if (!submitted.length) return null;
    const best = Math.max(...submitted.map((a) => a.final_score!));
    return (
      <span className="text-sm font-semibold text-emerald-700">
        Best: {best.toFixed(1)}
      </span>
    );
  }

  function canStart(a: AssignmentRow) {
    const attempts = attemptsByAssignment.get(a.id) ?? [];
    const submitted = attempts.filter((x) => x.submitted_at).length;
    const inProgress = attempts.find((x) => !x.submitted_at);
    return inProgress || submitted < a.attempts_allowed;
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-slate-900 mb-6">My Quizzes</h1>

      {/* Open */}
      {openQuizzes.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
            Available Now
          </h2>
          <div className="space-y-3">
            {openQuizzes.map((a) => (
              <div key={a.id} className="bg-white border border-slate-200 rounded-xl px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-slate-900 truncate">{a.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                        a.mode === "exam" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                      }`}>{a.mode}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 mb-2">
                      <span>{a.questions_per_student} questions</span>
                      <span>{a.time_limit_mins ? `${a.time_limit_mins} min` : "No time limit"}</span>
                      {a.close_at && <span>Closes {fmtDate(a.close_at)}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <AttemptsInfo assignmentId={a.id} allowed={a.attempts_allowed} />
                      <BestScore assignmentId={a.id} />
                    </div>
                  </div>
                  {canStart(a) ? (
                    <Link
                      href={`/trainee/quizzes/${a.id}`}
                      className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      {(attemptsByAssignment.get(a.id) ?? []).some((x) => !x.submitted_at)
                        ? "Continue"
                        : "Start"}
                    </Link>
                  ) : (
                    <span className="shrink-0 text-xs text-slate-400 bg-slate-100 px-3 py-2 rounded-lg">
                      Completed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {upcomingQuizzes.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
            Upcoming
          </h2>
          <div className="space-y-3">
            {upcomingQuizzes.map((a) => (
              <div key={a.id} className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 opacity-80">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-semibold text-slate-900 truncate">{a.title}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Upcoming</span>
                </div>
                <p className="text-xs text-slate-500">
                  Opens {fmtDate(a.open_at)} · {a.questions_per_student} questions
                  {a.time_limit_mins ? ` · ${a.time_limit_mins} min` : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Closed / Past */}
      {closedQuizzes.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
            Past Quizzes
          </h2>
          <div className="space-y-3">
            {closedQuizzes.map((a) => {
              const attempts = (attemptsByAssignment.get(a.id) ?? []).filter((x) => x.submitted_at);
              return (
                <div key={a.id} className="bg-white border border-slate-200 rounded-xl px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-medium text-slate-700 truncate">{a.title}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Closed</span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {attempts.length} attempt{attempts.length !== 1 ? "s" : ""} submitted
                        {a.close_at ? ` · Closed ${fmtDate(a.close_at)}` : ""}
                      </p>
                    </div>
                    <BestScore assignmentId={a.id} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!(assignments ?? []).length && (
        <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-300">
          <p className="text-slate-500 font-medium">No quizzes assigned yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Check back when your trainer assigns a quiz.
          </p>
        </div>
      )}
    </div>
  );
}
