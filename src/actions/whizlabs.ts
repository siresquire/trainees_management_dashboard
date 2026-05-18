"use server";

import * as XLSX from "xlsx";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type WhizlabsUploadState = {
  error?: string;
  matched?: number;
  skipped?: number;
  warnings?: string[];
} | null;

// ── Column detection ──────────────────────────────────────────────────────

function colIdx(headers: string[], ...aliases: string[]): number {
  return aliases
    .map((a) => headers.indexOf(a.toLowerCase()))
    .find((i) => i >= 0) ?? -1;
}

interface WhizlabsRow {
  email: string;
  labTitle: string;
}

function parseWhizlabsFile(rows: string[][]): WhizlabsRow[] {
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => (h ?? "").toString().trim().toLowerCase());

  // Email: "email", "user email", "username", "user"
  const emailIdx = colIdx(
    headers,
    "email",
    "user email",
    "username",
    "user",
    "learner email",
    "amalitech email"
  );

  // Lab title: "lab title", "lab name", "title", "course title", "course name", "name"
  const labIdx = colIdx(
    headers,
    "lab title",
    "lab name",
    "title",
    "course title",
    "course name",
    "activity",
    "name"
  );

  if (emailIdx === -1 || labIdx === -1) return [];

  const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").toString().trim() : "");

  return rows
    .slice(1)
    .filter((row) => row.length > Math.max(emailIdx, labIdx))
    .map((row) => ({
      email: get(row, emailIdx).toLowerCase(),
      labTitle: get(row, labIdx),
    }))
    .filter((r) => r.email.includes("@") && r.labTitle.length > 0);
}

async function parseFile(file: File): Promise<WhizlabsRow[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" }) as string[][];
  return parseWhizlabsFile(rows);
}

// ── Upload action ─────────────────────────────────────────────────────────

export async function uploadWhizlabs(
  _prev: WhizlabsUploadState,
  formData: FormData
): Promise<WhizlabsUploadState> {
  const cohortId = formData.get("cohort_id") as string;
  const file = formData.get("whizlabs_file") as File | null;

  if (!cohortId) return { error: "Missing cohort ID." };
  if (!file || file.size === 0) return { error: "Please select a file." };
  if (file.size > 5_000_000) return { error: "File too large (max 5 MB)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Access check
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") {
    const { data: access } = await supabase
      .from("cohort_access")
      .select("id")
      .eq("cohort_id", cohortId)
      .eq("trainer_id", user.id)
      .maybeSingle();
    if (!access) return { error: "You do not have access to this cohort." };
  }

  // Parse
  let entries: WhizlabsRow[];
  try {
    entries = await parseFile(file);
  } catch (e) {
    return { error: `Could not parse file: ${(e as Error).message}` };
  }

  if (!entries.length) {
    return {
      error:
        "No valid rows found. Expected columns: Email (or Username) and Lab Title (or Lab Name).",
    };
  }

  const svc = createServiceClient();

  // Load cohort lab tasks
  const { data: tasks } = await svc
    .from("cohort_week_tasks")
    .select("id, task_name")
    .eq("cohort_id", cohortId)
    .eq("task_type", "lab");

  if (!tasks?.length) {
    return {
      error:
        "No lab tasks found for this cohort. Add tasks first under the Tasks tab.",
    };
  }

  // Normalised task name → task id
  const taskMap = new Map(
    tasks.map((t) => [t.task_name.toLowerCase().trim(), t.id])
  );

  // Load trainees — match by amalitech_email first, personal_email as fallback
  const { data: trainees } = await svc
    .from("trainees")
    .select("id, personal_email, amalitech_email")
    .eq("cohort_id", cohortId)
    .is("deleted_at", null);

  if (!trainees?.length) {
    return { error: "No trainees found in this cohort." };
  }

  // email → trainee_id (amalitech takes priority — inserted last so it wins)
  const traineeByEmail = new Map<string, string>();
  for (const t of trainees) {
    if (t.personal_email)  traineeByEmail.set(t.personal_email.toLowerCase(), t.id);
    if (t.amalitech_email) traineeByEmail.set(t.amalitech_email.toLowerCase(), t.id);
  }

  // Build upserts — deduplicate by (trainee_id, task_id)
  const seen = new Set<string>();
  const upserts: {
    trainee_id: string;
    task_id: string;
    score: null;
    completed_at: string;
    source: string;
  }[] = [];
  let skipped = 0;
  const unmatchedEmails = new Set<string>();
  const unmatchedLabs = new Set<string>();

  for (const entry of entries) {
    const traineeId = traineeByEmail.get(entry.email);
    if (!traineeId) {
      unmatchedEmails.add(entry.email);
      skipped++;
      continue;
    }

    const taskId = taskMap.get(entry.labTitle.toLowerCase().trim());
    if (!taskId) {
      unmatchedLabs.add(entry.labTitle);
      skipped++;
      continue;
    }

    const key = `${traineeId}:${taskId}`;
    if (seen.has(key)) continue; // duplicate row in CSV
    seen.add(key);

    upserts.push({
      trainee_id: traineeId,
      task_id: taskId,
      score: null,
      completed_at: new Date().toISOString(),
      source: "whizlabs",
    });
  }

  const warnings: string[] = [];

  if (!upserts.length) {
    if (unmatchedEmails.size > 0) {
      warnings.push(
        `Emails not matched (first 3): ${[...unmatchedEmails].slice(0, 3).join(", ")}`
      );
    }
    if (unmatchedLabs.size > 0) {
      warnings.push(
        `Lab titles not matched (first 3): ${[...unmatchedLabs].slice(0, 3).join(", ")}`
      );
    }
    return {
      error:
        "No completions matched. Check that Amalitech emails and lab names in the CSV match the cohort exactly.",
      warnings,
    };
  }

  const { error } = await svc
    .from("completions")
    .upsert(upserts, { onConflict: "trainee_id,task_id" });

  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}/whizlabs`);
  revalidatePath(`/trainer/cohorts/${cohortId}`);
  revalidatePath(`/trainer/cohorts/${cohortId}/trainees`);

  if (unmatchedEmails.size > 0) {
    warnings.push(
      `${unmatchedEmails.size} email(s) not matched — check Amalitech emails on the roster`
    );
  }
  if (unmatchedLabs.size > 0) {
    warnings.push(
      `${unmatchedLabs.size} lab title(s) not matched — check task names under Tasks tab`
    );
  }

  return { matched: upserts.length, skipped, warnings: warnings.length ? warnings : undefined };
}
