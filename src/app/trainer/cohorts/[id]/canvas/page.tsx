import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TokenForm from "./TokenForm";
import { InitTemplateButton, SyncButton } from "./SyncButton";

export default async function CanvasSetupPage({
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
    .select("level, platform, canvas_course_id, canvas_api_token_encrypted, last_canvas_sync_at")
    .eq("id", id)
    .single();

  // Task count
  const { count: taskCount } = await supabase
    .from("cohort_week_tasks")
    .select("id", { count: "exact", head: true })
    .eq("cohort_id", id);

  const isCanvas = cohort?.platform === "canvas";
  const hasToken = !!cohort?.canvas_api_token_encrypted;
  const hasTasks = (taskCount ?? 0) > 0;

  return (
    <div className="max-w-2xl space-y-6">
      {!isCanvas && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
          Canvas sync is only available for Practitioner (Canvas) cohorts. This cohort uses{" "}
          <strong>{cohort?.platform}</strong>.
        </div>
      )}

      {/* API Token */}
      <Section
        title="Canvas API Token"
        description="Required to pull grades. Generate a token in your Canvas account settings under Approved Integrations."
        disabled={!isCanvas}
      >
        {cohort?.canvas_course_id ? (
          <p className="text-xs text-slate-500 mb-3">
            Course ID: <code className="bg-slate-100 px-1 rounded">{cohort.canvas_course_id}</code>
          </p>
        ) : (
          <p className="text-xs text-amber-600 mb-3">
            No Canvas Course ID set. Edit the cohort to add it.
          </p>
        )}
        <TokenForm cohortId={id} hasToken={hasToken} />
      </Section>

      {/* Curriculum Setup */}
      <Section
        title="Curriculum Setup"
        description="Copy the default AWS re/Start KC and Lab tasks into this cohort so Canvas grades can be matched."
        disabled={!isCanvas}
      >
        {hasTasks ? (
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
              {taskCount} task{taskCount !== 1 ? "s" : ""} configured
            </span>
            <a href={`/trainer/cohorts/${id}/tasks`} className="text-sm text-slate-500 hover:text-orange-600 underline">
              Edit tasks →
            </a>
          </div>
        ) : (
          <p className="text-sm text-amber-600 mb-3">No tasks yet — initialize from the default template.</p>
        )}
        <InitTemplateButton cohortId={id} cohortLevel={cohort?.level ?? ""} />
      </Section>

      {/* Sync */}
      <Section
        title="Canvas Sync"
        description="Pull the latest grades from Canvas and upsert completions. The daily GitHub Actions cron does this automatically; use this for immediate updates."
        disabled={!isCanvas || !hasToken || !hasTasks}
      >
        {cohort?.last_canvas_sync_at && (
          <p className="text-xs text-slate-500 mb-3">
            Last synced:{" "}
            {new Date(cohort.last_canvas_sync_at).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
        {(!hasToken || !hasTasks) && isCanvas && (
          <p className="text-xs text-amber-600 mb-3">
            {!hasToken ? "Save a Canvas token first." : "Initialize curriculum tasks first."}
          </p>
        )}
        <SyncButton cohortId={id} />
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  disabled,
  children,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-6 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <h2 className="text-sm font-semibold text-slate-900 mb-0.5">{title}</h2>
      <p className="text-xs text-slate-500 mb-4">{description}</p>
      {children}
    </div>
  );
}
