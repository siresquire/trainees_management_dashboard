import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import AddTaskForm from "./AddTaskForm";
import TasksClient from "./TasksClient";
import AssociateTaskTools from "./AssociateTaskTools";

export default async function TasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("level")
    .eq("id", id)
    .single();

  const isAssociate = cohort?.level === "associate";

  const { data: tasks } = await supabase
    .from("cohort_week_tasks")
    .select("id, week_number, task_name, task_type, display_order")
    .eq("cohort_id", id)
    .order("week_number")
    .order("display_order")
    .order("task_type");

  // Completion counts per task
  const { data: completionCounts } = tasks?.length
    ? await supabase
        .from("completions")
        .select("task_id")
        .in("task_id", tasks.map((t) => t.id))
    : { data: [] };

  const countMap: Record<string, number> = {};
  for (const c of completionCounts ?? []) {
    countMap[c.task_id] = (countMap[c.task_id] ?? 0) + 1;
  }

  // Active trainee count (for drawer context)
  const { count: totalTrainees } = await supabase
    .from("trainees")
    .select("id", { count: "exact", head: true })
    .eq("cohort_id", id)
    .eq("status", "active");

  const kcCount    = tasks?.filter((t) => t.task_type === "kc").length ?? 0;
  const labCount   = tasks?.filter((t) => t.task_type === "lab").length ?? 0;
  const videoCount = tasks?.filter((t) => t.task_type === "video").length ?? 0;

  // Group by week for the client component
  const byWeekMap: Record<number, typeof tasks> = {};
  for (const task of tasks ?? []) {
    if (!byWeekMap[task.week_number]) byWeekMap[task.week_number] = [];
    byWeekMap[task.week_number]!.push(task);
  }
  const weeks = Object.keys(byWeekMap).map(Number).sort((a, b) => a - b);

  // Attach completion counts
  const byWeek: Record<number, { id: string; task_name: string; task_type: string; completionCount: number }[]> = {};
  for (const week of weeks) {
    byWeek[week] = (byWeekMap[week] ?? []).map((t) => ({
      id: t.id,
      task_name: t.task_name,
      task_type: t.task_type,
      completionCount: countMap[t.id] ?? 0,
    }));
  }

  const summaryParts = [`${tasks?.length ?? 0} tasks total`];
  if (kcCount)    summaryParts.push(`${kcCount} KCs`);
  if (labCount)   summaryParts.push(`${labCount} Labs`);
  if (videoCount) summaryParts.push(`${videoCount} Videos`);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-500">
          {summaryParts.join(" · ")}
        </span>
        {!tasks?.length && !isAssociate && (
          <Link href={`/trainer/cohorts/${id}/canvas`} className="text-sm text-orange-600 hover:underline">
            Initialize from template →
          </Link>
        )}
      </div>

      {/* Associate: bulk import tools */}
      {isAssociate && (
        <AssociateTaskTools cohortId={id} />
      )}

      <TasksClient
        weeks={weeks}
        byWeek={byWeek}
        cohortId={id}
        totalTrainees={totalTrainees ?? 0}
      />

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Add task</h3>
        <AddTaskForm cohortId={id} defaultWeek={weeks.length ? Math.max(...weeks) : 1} />
      </div>
    </div>
  );
}
