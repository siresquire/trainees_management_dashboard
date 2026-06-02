"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as XLSX from "xlsx";

async function assertAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cohortId: string,
  userId: string
) {
  // Super admins have universal access
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (profile?.role === "super_admin") return;

  const { data } = await supabase
    .from("cohort_access")
    .select("id")
    .eq("cohort_id", cohortId)
    .eq("trainer_id", userId)
    .single();
  if (!data) throw new Error("Access denied.");
}

const AddTaskSchema = z.object({
  cohort_id: z.string().uuid(),
  week_number: z.coerce.number().int().min(0).max(52),
  task_name: z.string().min(1).max(300),
  task_type: z.enum(["kc", "lab", "video"]),
});

export type AddTaskState = { error?: string; success?: boolean } | null;

export async function addTask(
  _prev: AddTaskState,
  formData: FormData
): Promise<AddTaskState> {
  const parsed = AddTaskSchema.safeParse({
    cohort_id: formData.get("cohort_id"),
    week_number: formData.get("week_number"),
    task_name: formData.get("task_name"),
    task_type: formData.get("task_type"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  try {
    await assertAccess(supabase, parsed.data.cohort_id, user.id);
  } catch {
    return { error: "Access denied." };
  }

  const { error } = await supabase.from("cohort_week_tasks").insert({
    cohort_id: parsed.data.cohort_id,
    week_number: parsed.data.week_number,
    task_name: parsed.data.task_name,
    task_type: parsed.data.task_type,
  });
  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${parsed.data.cohort_id}/tasks`);
  return { success: true };
}

// ── Update an existing task ───────────────────────────────────────────────

const UpdateTaskSchema = z.object({
  task_name:   z.string().min(1, "Task name is required").max(300),
  task_type:   z.enum(["kc", "lab", "video"]),
  week_number: z.coerce.number().int().min(0).max(52),
});

export async function updateTask(
  taskId: string,
  cohortId: string,
  fields: { task_name: string; task_type: string; week_number: number }
): Promise<{ success?: boolean; error?: string }> {
  const parsed = UpdateTaskSchema.safeParse(fields);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  try {
    await assertAccess(supabase, cohortId, user.id);
  } catch {
    return { error: "Access denied." };
  }

  const { error } = await supabase
    .from("cohort_week_tasks")
    .update({
      task_name:   parsed.data.task_name,
      task_type:   parsed.data.task_type,
      week_number: parsed.data.week_number,
    })
    .eq("id", taskId)
    .eq("cohort_id", cohortId);

  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}/tasks`);
  return { success: true };
}

// ── Delete a task ─────────────────────────────────────────────────────────

export async function deleteTask(taskId: string, cohortId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  try {
    await assertAccess(supabase, cohortId, user.id);
  } catch {
    return { error: "Access denied." };
  }

  const { error } = await supabase
    .from("cohort_week_tasks")
    .delete()
    .eq("id", taskId)
    .eq("cohort_id", cohortId);
  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}/tasks`);
  return { success: true };
}

// ── Delete all tasks for a single week ────────────────────────────────────

export async function deleteWeekTasks(cohortId: string, weekNumber: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  try { await assertAccess(supabase, cohortId, user.id); }
  catch { return { error: "Access denied." }; }

  const { error } = await supabase
    .from("cohort_week_tasks")
    .delete()
    .eq("cohort_id", cohortId)
    .eq("week_number", weekNumber);
  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}/tasks`);
  return { success: true };
}

// ── Delete ALL tasks for a cohort ──────────────────────────────────────────

export async function deleteAllTasks(cohortId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  try { await assertAccess(supabase, cohortId, user.id); }
  catch { return { error: "Access denied." }; }

  const { error } = await supabase
    .from("cohort_week_tasks")
    .delete()
    .eq("cohort_id", cohortId);
  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}/tasks`);
  return { success: true };
}

// ── Bulk import from Excel template ────────────────────────────────────────

const TYPE_MAP: Record<string, "kc" | "lab" | "video"> = {
  lab: "lab",
  kc: "kc",
  "knowledge check": "kc",
  video: "video",
};

export type BulkImportState = {
  error?: string;
  inserted?: number;
  skipped?: number;
  warnings?: string[];
} | null;

export async function bulkImportAssociateTasks(
  _prev: BulkImportState,
  formData: FormData
): Promise<BulkImportState> {
  const cohortId = formData.get("cohort_id") as string | null;
  const file = formData.get("file") as File | null;

  if (!cohortId) return { error: "Missing cohort ID." };
  if (!file || file.size === 0) return { error: "Please select a file to upload." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  try {
    await assertAccess(supabase, cohortId, user.id);
  } catch {
    return { error: "Access denied." };
  }

  // ── Parse Excel ────────────────────────────────────────────────────────────
  let rows: Record<string, unknown>[];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });

    // Prefer the "Tasks" sheet; fall back to first sheet
    const sheetName =
      wb.SheetNames.find((n) => n.toLowerCase() === "tasks") ??
      wb.SheetNames[0];
    if (!sheetName) return { error: "The file contains no sheets." };

    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[sheetName],
      { defval: "" }
    );
  } catch {
    return { error: "Could not read the file. Make sure it is a valid .xlsx file." };
  }

  if (rows.length === 0) return { error: "The Tasks sheet is empty." };

  // ── Normalise header keys (case-insensitive) ───────────────────────────────
  function pick(row: Record<string, unknown>, ...keys: string[]): string {
    for (const k of Object.keys(row)) {
      if (keys.includes(k.toLowerCase().trim())) {
        return String(row[k] ?? "").trim();
      }
    }
    return "";
  }

  // ── Fetch existing tasks to detect duplicates ─────────────────────────────
  const { data: existing } = await supabase
    .from("cohort_week_tasks")
    .select("task_name, week_number")
    .eq("cohort_id", cohortId);

  const existingKeys = new Set(
    (existing ?? []).map((t) => `${t.week_number}:${t.task_name.toLowerCase()}`)
  );

  // ── Build insert rows ─────────────────────────────────────────────────────
  const toInsert: {
    cohort_id: string;
    week_number: number;
    task_name: string;
    task_type: "kc" | "lab" | "video";
  }[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header row

    const taskName = pick(row, "task name", "name", "title");
    const typeRaw  = pick(row, "type");
    const weekRaw  = pick(row, "week", "week number", "week_number");

    if (!taskName) { skipped++; continue; }

    const weekNum = parseInt(weekRaw, 10);
    if (isNaN(weekNum) || weekNum < 1 || weekNum > 52) {
      warnings.push(`Row ${rowNum}: invalid week "${weekRaw}" for "${taskName}" — skipped.`);
      skipped++;
      continue;
    }

    const mappedType = TYPE_MAP[typeRaw.toLowerCase()];
    if (!mappedType) {
      warnings.push(`Row ${rowNum}: unknown type "${typeRaw}" for "${taskName}" — skipped. Use Lab, KC, or Video.`);
      skipped++;
      continue;
    }

    const key = `${weekNum}:${taskName.toLowerCase()}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }

    existingKeys.add(key); // prevent duplicates within the uploaded file
    toInsert.push({
      cohort_id: cohortId,
      week_number: weekNum,
      task_name: taskName,
      task_type: mappedType,
    });
  }

  if (toInsert.length === 0) {
    return {
      error: skipped > 0
        ? "No new tasks to import — all rows were duplicates or had errors."
        : "No valid task rows found. Check that the file has Task Name, Type, and Week columns.",
      skipped,
      warnings: warnings.slice(0, 5),
    };
  }

  // ── Insert in batches of 100 ──────────────────────────────────────────────
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100);
    const { error, data } = await supabase
      .from("cohort_week_tasks")
      .insert(batch)
      .select("id");
    if (error) {
      warnings.push(`Batch insert error: ${error.message}`);
    } else {
      inserted += data?.length ?? batch.length;
    }
  }

  revalidatePath(`/trainer/cohorts/${cohortId}/tasks`);

  return {
    inserted,
    skipped,
    warnings: warnings.slice(0, 5),
  };
}
