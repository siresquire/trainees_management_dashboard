"use server";

import * as XLSX from "xlsx";
import { createClient as createSupabaseJS } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type RosterUploadState = {
  error?: string;
  inserted?: number;
  skipped?: number;
  invited?: number;
  inviteErrors?: string[];
} | null;

// ── Normalise a raw row from roster sheet ────────────────────────────────

interface RosterRow {
  serial_no: number | null;
  full_name: string;
  personal_email: string;
  amalitech_email: string;
  index_number: string;
  phone: string;
  gender: "male" | "female" | null;
  cohort_type: "university" | "external" | "graduate" | null;
  university: string;
  town: string;
  region: string;
}

function normaliseCohortType(raw: string): RosterRow["cohort_type"] {
  const v = raw?.trim().toLowerCase();
  if (v === "university") return "university";
  if (v === "external") return "external";
  if (v === "graduate") return "graduate";
  return null;
}

function colIdx(headers: string[], ...aliases: string[]): number {
  return aliases
    .map((a) => headers.indexOf(a.toLowerCase()))
    .find((i) => i >= 0) ?? -1;
}

function parseSheet(rows: string[][]): RosterRow[] {
  if (rows.length < 2) return [];

  // Require a header row
  const firstLower = rows[0].join(",").toLowerCase();
  if (!firstLower.includes("name") && !firstLower.includes("s/n") && !firstLower.startsWith("#")) {
    return [];
  }

  const headers = rows[0].map((h) => (h ?? "").toString().trim().toLowerCase());
  const snI        = colIdx(headers, "s/n", "#");
  const nameI      = colIdx(headers, "full name", "name");
  const idxNumI    = colIdx(headers, "index number", "index no", "matriculation number", "student id");
  const emailI     = colIdx(headers, "personal email", "email");
  const aEmailI    = colIdx(headers, "amalitech email", "amalitech training email");
  const phoneI     = colIdx(headers, "phone number", "phone");
  const genderI    = colIdx(headers, "gender");
  const typeI      = colIdx(headers, "type");
  const univI      = colIdx(headers, "university");
  const townI      = colIdx(headers, "town");
  const regionI    = colIdx(headers, "region");

  const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").toString().trim() : "");

  const result: RosterRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const c = rows[i].map((v) => (v ?? "").toString().trim());
    if (c.length < 3) continue;

    const name = get(c, nameI);
    const personal_email = get(c, emailI).toLowerCase();
    if (!name || !personal_email.includes("@")) continue;

    const gRaw = get(c, genderI).toLowerCase();
    const gender = gRaw === "male" ? "male" : gRaw === "female" ? "female" : null;

    result.push({
      serial_no: parseInt(get(c, snI), 10) || null,
      full_name: name,
      personal_email,
      amalitech_email: get(c, aEmailI).toLowerCase(),
      index_number: get(c, idxNumI),
      phone: get(c, phoneI),
      gender,
      cohort_type: normaliseCohortType(get(c, typeI)),
      university: get(c, univI),
      town: get(c, townI),
      region: get(c, regionI),
    });
  }

  return result;
}

async function parseFile(file: File): Promise<RosterRow[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv" || file.type === "text/csv") {
    const wb = XLSX.read(buffer, { type: "buffer", raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
    return parseSheet(rows as string[][]);
  }

  // Excel (.xlsx / .xls / .xlsm)
  const wb = XLSX.read(buffer, { type: "buffer" });
  // Look for the "Roster" sheet first, then fall back to first sheet
  const sheetName = wb.SheetNames.includes("Roster") ? "Roster" : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
  return parseSheet(rows as string[][]);
}

// ── Upload roster action ─────────────────────────────────────────────────

export async function uploadRoster(
  _prev: RosterUploadState,
  formData: FormData
): Promise<RosterUploadState> {
  const cohortId = formData.get("cohort_id") as string;
  const file = formData.get("roster_file") as File | null;
  const sendInvites = formData.get("send_invites") === "1";

  if (!cohortId) return { error: "Missing cohort ID." };
  if (!file || file.size === 0) return { error: "Please select a file." };
  if (file.size > 2_000_000) return { error: "File too large (max 2 MB)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: access } = await supabase
    .from("cohort_access")
    .select("id")
    .eq("cohort_id", cohortId)
    .eq("trainer_id", user.id)
    .single();
  if (!access) return { error: "You do not have access to this cohort." };

  let rows: RosterRow[];
  try {
    rows = await parseFile(file);
  } catch (e) {
    return { error: `Could not parse file: ${(e as Error).message}` };
  }
  if (!rows.length) return { error: "No valid rows found in the file." };

  const inserts = rows.map((r) => ({
    cohort_id: cohortId,
    full_name: r.full_name,
    personal_email: r.personal_email,
    amalitech_email: r.amalitech_email || null,
    index_number: r.index_number || null,
    phone: r.phone || null,
    gender: r.gender,
    cohort_type: r.cohort_type,
    university: r.university || null,
    town: r.town || null,
    region: (r.region || null) as any,
    serial_no: r.serial_no,
    status: "active" as const,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("trainees")
    .upsert(inserts, { onConflict: "cohort_id,personal_email", ignoreDuplicates: false })
    .select("id, personal_email, full_name");

  if (insertError) return { error: insertError.message };

  let invited = 0;
  const inviteErrors: string[] = [];

  if (sendInvites && inserted?.length) {
    const serviceClient = createServiceClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    for (const trainee of inserted) {
      try {
        const { error: inviteErr } = await (serviceClient.auth.admin as any).inviteUserByEmail(
          trainee.personal_email,
          {
            redirectTo: `${appUrl}/auth/accept-invite`,
            data: { full_name: trainee.full_name, role: "trainee" },
          }
        );
        if (inviteErr) inviteErrors.push(`${trainee.personal_email}: ${inviteErr.message}`);
        else invited++;
      } catch {
        inviteErrors.push(`${trainee.personal_email}: unexpected error`);
      }
    }
  }

  revalidatePath(`/trainer/cohorts/${cohortId}`);

  return {
    inserted: inserted?.length ?? 0,
    skipped: rows.length - (inserted?.length ?? 0),
    invited,
    inviteErrors: inviteErrors.length ? inviteErrors : undefined,
  };
}

export async function inviteTrainee(traineeId: string, cohortId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: trainee } = await supabase
    .from("trainees")
    .select("personal_email, full_name, user_id")
    .eq("id", traineeId)
    .eq("cohort_id", cohortId)
    .single();

  if (!trainee) return { error: "Trainee not found." };

  const serviceClient = createServiceClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Try invite (works for users not yet in auth.users)
  const { error: inviteErr } = await (serviceClient.auth.admin as any).inviteUserByEmail(
    trainee.personal_email,
    {
      redirectTo: `${appUrl}/auth/accept-invite`,
      data: { full_name: trainee.full_name, role: "trainee" },
    }
  );

  if (!inviteErr) return { success: true };

  // User already exists — send a magic link instead (implicit flow, no PKCE)
  if ((inviteErr as any).code === "email_exists" || inviteErr.status === 422) {
    const implicitClient = createSupabaseJS(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { flowType: "implicit", autoRefreshToken: false, persistSession: false } }
    );
    const { error: otpErr } = await implicitClient.auth.signInWithOtp({
      email: trainee.personal_email,
      options: { shouldCreateUser: false, emailRedirectTo: `${appUrl}/auth/accept-invite` },
    });
    if (otpErr) return { error: otpErr.message };
    return { success: true };
  }

  return { error: inviteErr.message };
}

// ── Cohort-access helper ──────────────────────────────────────────────────

async function assertCohortAccess(cohortId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();

  const isSuperAdmin = profile?.role === "super_admin";

  if (!isSuperAdmin) {
    const { data: access } = await supabase
      .from("cohort_access")
      .select("role")
      .eq("cohort_id", cohortId)
      .eq("trainer_id", user.id)
      .maybeSingle();
    if (!access) throw new Error("Not authorised");
  }

  return { isSuperAdmin };
}

// ── Update trainee details ─────────────────────────────────────────────────

const EditSchema = z.object({
  full_name:       z.string().min(2, "Name is required"),
  personal_email:  z.string().email("Valid email required"),
  amalitech_email: z.string().email("Valid email required").optional().or(z.literal("")),
  phone:           z.string().optional().or(z.literal("")),
  gender:          z.string().optional().or(z.literal("")),
  town:            z.string().optional().or(z.literal("")),
  region:          z.string().optional().or(z.literal("")),
  university:      z.string().optional().or(z.literal("")),
  serial_no:       z.coerce.number().int().positive().optional().or(z.literal("")),
});

export type TraineeEditState = {
  errors?: Record<string, string[]>;
  error?: string;
  success?: boolean;
} | null;

export async function updateTraineeDetails(
  _prev: TraineeEditState,
  formData: FormData
): Promise<TraineeEditState> {
  const cohortId  = formData.get("cohort_id") as string;
  const traineeId = formData.get("trainee_id") as string;

  try {
    await assertCohortAccess(cohortId);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const parsed = EditSchema.safeParse({
    full_name:       formData.get("full_name"),
    personal_email:  formData.get("personal_email"),
    amalitech_email: formData.get("amalitech_email") || "",
    phone:           formData.get("phone") || "",
    gender:          formData.get("gender") || "",
    town:            formData.get("town") || "",
    region:          formData.get("region") || "",
    university:      formData.get("university") || "",
    serial_no:       formData.get("serial_no") || "",
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("trainees")
    .update({
      full_name:       parsed.data.full_name,
      personal_email:  parsed.data.personal_email,
      amalitech_email: parsed.data.amalitech_email || null,
      phone:           parsed.data.phone || null,
      gender:          parsed.data.gender || null,
      town:            parsed.data.town || null,
      region:          (parsed.data.region as any) || null,
      university:      parsed.data.university || null,
      serial_no:       typeof parsed.data.serial_no === "number" ? parsed.data.serial_no : null,
      updated_at:      new Date().toISOString(),
    })
    .eq("id", traineeId)
    .eq("cohort_id", cohortId);

  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}/trainees/${traineeId}`);
  revalidatePath(`/trainer/cohorts/${cohortId}`);
  return { success: true };
}

// ── Change trainee status ──────────────────────────────────────────────────

export async function changeTraineeStatus(
  traineeId: string,
  cohortId: string,
  status: "active" | "completed" | "dropped" | "suspended" | "disabled"
): Promise<{ success?: boolean; error?: string }> {
  let isSuperAdmin = false;
  try {
    ({ isSuperAdmin } = await assertCohortAccess(cohortId));
  } catch (e) {
    return { error: (e as Error).message };
  }

  if (status === "disabled" && !isSuperAdmin) {
    return { error: "Only Super Admin can disable a trainee account." };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("trainees")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", traineeId)
    .eq("cohort_id", cohortId);

  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}/trainees/${traineeId}`);
  revalidatePath(`/trainer/cohorts/${cohortId}`);
  return { success: true };
}

// ── Soft delete trainee ────────────────────────────────────────────────────

export async function softDeleteTrainee(
  traineeId: string,
  cohortId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    await assertCohortAccess(cohortId);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("trainees")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", traineeId)
    .eq("cohort_id", cohortId);

  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}`);
  return { success: true };
}

// ── Restore deleted trainee (SA only) ─────────────────────────────────────

export async function restoreTrainee(
  traineeId: string,
  cohortId: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "super_admin") return { error: "Only Super Admin can restore deleted trainees" };

  const svc = createServiceClient();
  const { error } = await svc
    .from("trainees")
    .update({ deleted_at: null, status: "active" })
    .eq("id", traineeId);

  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}`);
  revalidatePath(`/trainer/cohorts/${cohortId}/trainees/${traineeId}`);
  return { success: true };
}

// ── Toggle graduation (Associate cohorts — manual) ────────────────────────

export async function toggleGraduation(
  traineeId: string,
  graduated: boolean
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Verify trainer has access to this trainee's cohort
  const { data: trainee } = await supabase
    .from("trainees")
    .select("cohort_id, cohorts(level)")
    .eq("id", traineeId)
    .single();
  if (!trainee) return { error: "Trainee not found" };

  const level = (trainee.cohorts as { level: string } | null)?.level;
  if (level === "practitioner") return { error: "Graduation for Practitioner cohorts is managed by Canvas" };

  const { error } = await supabase
    .from("trainees")
    .update({ graduated })
    .eq("id", traineeId);

  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${trainee.cohort_id}`);
  revalidatePath(`/trainer/cohorts/${trainee.cohort_id}/trainees/${traineeId}`);
  return { success: true };
}
