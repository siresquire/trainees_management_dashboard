"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/encryption";
import { verifyCanvasToken, canvasFetchAll, normaliseName } from "@/lib/canvas";
import { revalidatePath } from "next/cache";

// ── Types ─────────────────────────────────────────────────────────────────

export type TokenTestResult = { courseName: string; students: number } | { error: string };
export type SaveTokenResult = { success: boolean } | { error: string };
export type InitTemplateResult = { inserted: number } | { error: string };
export type SyncResult = { completions: number; skipped: number; warnings: string[] } | { error: string };

// ── Helper: verify trainer owns the cohort ────────────────────────────────

async function assertAccess(supabase: Awaited<ReturnType<typeof createClient>>, cohortId: string, userId: string) {
  const { data } = await supabase
    .from("cohort_access")
    .select("id")
    .eq("cohort_id", cohortId)
    .eq("trainer_id", userId)
    .single();
  if (!data) throw new Error("Access denied.");
}

// ── Test Canvas token ─────────────────────────────────────────────────────

export async function testCanvasToken(
  _prev: TokenTestResult | null,
  formData: FormData
): Promise<TokenTestResult> {
  const cohortId = formData.get("cohort_id") as string;
  const tokenInput = (formData.get("token") as string)?.trim();

  if (!tokenInput) return { error: "Please enter a Canvas API token." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  try {
    await assertAccess(supabase, cohortId, user.id);
  } catch {
    return { error: "Access denied." };
  }

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("canvas_course_id")
    .eq("id", cohortId)
    .single();

  if (!cohort?.canvas_course_id) return { error: "No Canvas Course ID set on this cohort. Edit the cohort to add it." };

  try {
    const result = await verifyCanvasToken(cohort.canvas_course_id, tokenInput);
    return { courseName: result.name, students: result.total_students };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ── Save Canvas token ─────────────────────────────────────────────────────

export async function saveCanvasToken(
  _prev: SaveTokenResult | null,
  formData: FormData
): Promise<SaveTokenResult> {
  const cohortId = formData.get("cohort_id") as string;
  const tokenInput = (formData.get("token") as string)?.trim();

  if (!tokenInput) return { error: "Token is required." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  try {
    await assertAccess(supabase, cohortId, user.id);
  } catch {
    return { error: "Access denied." };
  }

  const encrypted = encrypt(tokenInput);
  const { error } = await supabase
    .from("cohorts")
    .update({ canvas_api_token_encrypted: encrypted })
    .eq("id", cohortId);

  if (error) return { error: error.message };
  revalidatePath(`/trainer/cohorts/${cohortId}/canvas`);
  return { success: true };
}

// ── Init cohort tasks from default template ───────────────────────────────

export async function initFromTemplate(cohortId: string, subtype?: string): Promise<InitTemplateResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  try {
    await assertAccess(supabase, cohortId, user.id);
  } catch {
    return { error: "Access denied." };
  }

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("level, platform")
    .eq("id", cohortId)
    .single();
  if (!cohort) return { error: "Cohort not found." };

  // Find the default template for this level (and subtype when provided)
  let templateQuery = supabase
    .from("curriculum_templates")
    .select("id")
    .eq("level", cohort.level)
    .eq("is_default", true);

  if (subtype) {
    templateQuery = templateQuery.eq("cohort_subtype", subtype);
  }

  const { data: template } = await templateQuery.single();

  if (!template) {
    const suffix = subtype ? ` (${subtype})` : "";
    return { error: `No default template found for ${cohort.level} level${suffix}.` };
  }

  const { data: templateTasks } = await supabase
    .from("template_tasks")
    .select("week_number, task_name, task_type, display_order")
    .eq("template_id", template.id)
    .order("week_number")
    .order("display_order");

  if (!templateTasks?.length) return { error: "Default template has no tasks." };

  // Fetch existing task names to avoid duplicates (no unique constraint on DB)
  const { data: existing } = await supabase
    .from("cohort_week_tasks")
    .select("week_number, task_name")
    .eq("cohort_id", cohortId);

  const existingSet = new Set(
    (existing ?? []).map((t) => `${t.week_number}:${t.task_name}`)
  );

  const inserts = templateTasks
    .filter((t) => !existingSet.has(`${t.week_number}:${t.task_name}`))
    .map((t) => ({
      cohort_id: cohortId,
      week_number: t.week_number,
      task_name: t.task_name,
      task_type: t.task_type,
      display_order: t.display_order,
    }));

  if (!inserts.length) {
    return { inserted: 0 };
  }

  const { data: inserted, error } = await supabase
    .from("cohort_week_tasks")
    .insert(inserts)
    .select("id");

  if (error) return { error: error.message };
  revalidatePath(`/trainer/cohorts/${cohortId}/canvas`);
  revalidatePath(`/trainer/cohorts/${cohortId}/tasks`);
  return { inserted: inserted?.length ?? 0 };
}

// ── Manual Canvas sync for a single cohort ────────────────────────────────

export async function syncCohortFromCanvas(cohortId: string): Promise<SyncResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  try {
    await assertAccess(supabase, cohortId, user.id);
  } catch {
    return { error: "Access denied." };
  }

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("canvas_course_id, canvas_api_token_encrypted")
    .eq("id", cohortId)
    .single();

  if (!cohort?.canvas_course_id) return { error: "No Canvas Course ID on this cohort." };
  if (!cohort.canvas_api_token_encrypted) return { error: "No Canvas API token saved. Add one first." };

  let token: string;
  try {
    token = decrypt(cohort.canvas_api_token_encrypted);
  } catch {
    return { error: "Failed to decrypt Canvas token. Please re-save it." };
  }

  const courseId = cohort.canvas_course_id;

  // 1. Fetch assignments (name lookup)
  const assignments = await canvasFetchAll<{ id: number; name: string }>(
    token,
    `/courses/${courseId}/assignments?per_page=100`
  );
  const assignmentMap = new Map(assignments.map((a) => [a.id, normaliseName(a.name)]));

  // 2. Load cohort week tasks
  const { data: tasks } = await supabase
    .from("cohort_week_tasks")
    .select("id, task_name, task_type")
    .eq("cohort_id", cohortId);
  if (!tasks?.length) return { error: "No week tasks set up. Initialize from template first." };
  const taskMap = new Map(tasks.map((t) => [t.task_name.trim(), t]));

  // 3. Load trainees (email → trainee_id, both personal and amalitech)
  const { data: trainees } = await supabase
    .from("trainees")
    .select("id, personal_email, amalitech_email")
    .eq("cohort_id", cohortId)
    .eq("status", "active");
  if (!trainees?.length) return { error: "No active trainees in this cohort." };

  const traineeByEmail = new Map<string, string>();
  for (const t of trainees) {
    if (t.personal_email) traineeByEmail.set(t.personal_email.toLowerCase(), t.id);
    if (t.amalitech_email) traineeByEmail.set(t.amalitech_email.toLowerCase(), t.id);
  }

  // 4. Fetch enrollments to resolve Canvas user_id → email
  const enrollments = await canvasFetchAll<{ user_id: number; user?: { login_id?: string } }>(
    token,
    `/courses/${courseId}/enrollments?type[]=StudentEnrollment&per_page=100`
  );
  const userEmailMap = new Map<number, string>();
  for (const e of enrollments) {
    if (e.user?.login_id) {
      userEmailMap.set(e.user_id, e.user.login_id.toLowerCase());
    }
  }

  // 5. Fetch all student submissions
  const submissions = await canvasFetchAll<{
    assignment_id: number;
    user_id: number;
    sis_login_id?: string;
    score: number | null;
    submitted_at: string | null;
    graded_at: string | null;
    workflow_state: string;
  }>(token, `/courses/${courseId}/students/submissions?student_ids[]=all&per_page=100`);

  // 6. Build upserts
  const upserts: {
    trainee_id: string;
    task_id: string;
    score: number | null;
    completed_at: string | null;
    source: string;
  }[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (const sub of submissions) {
    const assignmentName = assignmentMap.get(sub.assignment_id);
    if (!assignmentName) { skipped++; continue; }

    const task = taskMap.get(assignmentName);
    if (!task) { skipped++; continue; }

    // Resolve trainee
    const email =
      userEmailMap.get(sub.user_id) ??
      sub.sis_login_id?.toLowerCase();
    if (!email) { skipped++; continue; }

    const traineeId = traineeByEmail.get(email);
    if (!traineeId) { skipped++; continue; }

    const score = sub.score != null ? parseFloat(String(sub.score)) : null;

    if (task.task_type === "kc") {
      if (score === null) { skipped++; continue; }
    } else {
      // lab — must be score = 1
      if (score !== 1) { skipped++; continue; }
    }

    upserts.push({
      trainee_id: traineeId,
      task_id: task.id,
      score: task.task_type === "kc" ? score : null,
      completed_at: sub.submitted_at ?? sub.graded_at,
      source: "canvas",
    });
  }

  const svc = createServiceClient();

  if (upserts.length) {
    const { error: upsertError } = await svc
      .from("completions")
      .upsert(upserts, { onConflict: "trainee_id,task_id" });
    if (upsertError) return { error: upsertError.message };
  }

  // Sync "Graduated" — it is a regular Canvas assignment (1 pt = graduated),
  // exported as "Graduated (id)" in the gradebook CSV. Use the already-fetched
  // assignments + submissions arrays; no extra API call needed.
  try {
    const gradAssignment = assignments.find(
      (a) => normaliseName(a.name).toLowerCase() === "graduated"
    );

    if (gradAssignment) {
      const graduatedIds: string[] = [];
      const notGraduatedIds: string[] = [];

      for (const sub of submissions) {
        if (sub.assignment_id !== gradAssignment.id) continue;
        const email =
          userEmailMap.get(sub.user_id) ??
          sub.sis_login_id?.toLowerCase();
        if (!email) continue;
        const traineeId = traineeByEmail.get(email);
        if (!traineeId) continue;
        const score = sub.score != null ? parseFloat(String(sub.score)) : null;
        if (score !== null && score >= 1) {
          graduatedIds.push(traineeId);
        } else {
          notGraduatedIds.push(traineeId);
        }
      }

      if (graduatedIds.length) {
        const { error: gradErr } = await svc
          .from("trainees")
          .update({ graduated: true })
          .in("id", graduatedIds);
        if (gradErr) warnings.push(`Graduated update error: ${gradErr.message}`);
      }
      if (notGraduatedIds.length) {
        await svc
          .from("trainees")
          .update({ graduated: false })
          .in("id", notGraduatedIds)
          .eq("graduated", true);
      }

      warnings.push(
        `Graduated: ${graduatedIds.length} marked, ${notGraduatedIds.length} not graduated`
      );
    } else {
      warnings.push("No 'Graduated' assignment found in Canvas course");
    }
  } catch (e) {
    warnings.push(`Graduated sync error: ${(e as Error).message}`);
  }

  // Stamp the cohort with the sync time
  await svc.from("cohorts").update({ last_canvas_sync_at: new Date().toISOString() }).eq("id", cohortId);

  revalidatePath(`/trainer/cohorts/${cohortId}/canvas`);
  revalidatePath(`/trainer/cohorts/${cohortId}`);
  return { completions: upserts.length, skipped, warnings };
}
