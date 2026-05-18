import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import WhizlabsUploadForm from "./WhizlabsUploadForm";

export default async function WhizlabsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("level, name")
    .eq("id", id)
    .single();

  if (!cohort || cohort.level !== "associate") notFound();

  // Task summary
  const { data: tasks } = await supabase
    .from("cohort_week_tasks")
    .select("id, task_name, week_number")
    .eq("cohort_id", id)
    .eq("task_type", "lab")
    .order("week_number")
    .order("task_name");

  const taskCount = tasks?.length ?? 0;

  // Recent completions count
  const { count: completionCount } = await supabase
    .from("completions")
    .select("id", { count: "exact", head: true })
    .in(
      "task_id",
      taskCount > 0 ? (tasks ?? []).map((t) => t.id) : ["00000000-0000-0000-0000-000000000000"]
    );

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-500 mb-1">Lab tasks configured</p>
          <p className="text-2xl font-bold text-slate-900">{taskCount}</p>
          {taskCount === 0 && (
            <Link
              href={`/trainer/cohorts/${id}/tasks`}
              className="text-xs text-orange-600 hover:underline mt-0.5 block"
            >
              Add tasks →
            </Link>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-500 mb-1">Completions recorded</p>
          <p className="text-2xl font-bold text-purple-600">{completionCount ?? 0}</p>
        </div>
      </div>

      {/* Upload form */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Upload Whizlabs completions</h2>
        <p className="text-xs text-slate-500 mb-4">
          {taskCount > 0 ? (
            <>
              Matching against{" "}
              <strong className="text-slate-700">{taskCount} lab task{taskCount !== 1 ? "s" : ""}</strong>.
              Lab titles in the CSV must match task names exactly (case-insensitive).
            </>
          ) : (
            <>
              No lab tasks configured yet.{" "}
              <Link href={`/trainer/cohorts/${id}/tasks`} className="text-orange-600 hover:underline">
                Add tasks under the Tasks tab
              </Link>{" "}
              before uploading.
            </>
          )}
        </p>
        <WhizlabsUploadForm cohortId={id} />
      </div>

      {/* Instructions */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4">
        <div>
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
            How to export from Whizlabs
          </h3>
          <ol className="space-y-1.5 text-sm text-slate-600 list-decimal list-inside">
            <li>Log in to the Whizlabs Teams dashboard</li>
            <li>Filter by your team and select the date range for the period</li>
            <li>Download as CSV or Excel</li>
            <li>Upload here — the system matches by email and lab title</li>
          </ol>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
            Matching rules
          </h3>
          <ul className="space-y-1 text-xs text-slate-500 list-disc list-inside">
            <li>
              <strong className="text-slate-600">Email</strong> — matched against trainee Amalitech
              email first, then personal email
            </li>
            <li>
              <strong className="text-slate-600">Lab title</strong> — matched against task names
              (case-insensitive, exact match)
            </li>
            <li>Any CSV entry for a known trainee + lab = marked completed</li>
            <li>Re-uploading the same file is safe — duplicates are ignored</li>
          </ul>
        </div>

        {taskCount > 0 && (
          <details className="group">
            <summary className="text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700">
              Show configured lab names ({taskCount})
            </summary>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
              {(tasks ?? []).map((t) => (
                <div key={t.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-700 truncate">{t.task_name}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">Week {t.week_number}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
