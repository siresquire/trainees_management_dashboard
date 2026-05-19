"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type AttResult = { error?: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Threshold-based status for Practitioner cohorts only.
 * For Associate / NSP: any duration > 0 means "present" — use statusFromDuration().
 */
function computeStatus(
  durationMins: number,
  totalMins: number,
  presentPct: number,
  partialPct: number,
): "present" | "partial" | "brief" | "absent" {
  if (totalMins <= 0 || durationMins <= 0) return "absent";
  const pct = (durationMins / totalMins) * 100;
  if (pct >= presentPct) return "present";
  if (pct >= partialPct) return "partial";
  return "brief";
}

/**
 * Practitioner → threshold-based (present / partial / brief / absent).
 * Associate / NSP → binary: any attendance = present, else absent.
 */
function statusFromDuration(
  durationMins: number,
  totalMins: number,
  isPractitioner: boolean,
  presentPct: number,
  partialPct: number,
): "present" | "partial" | "brief" | "absent" {
  if (durationMins <= 0) return "absent";
  if (!isPractitioner) return "present";
  return computeStatus(durationMins, totalMins, presentPct, partialPct);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(text: string): string[][] {
  return text.split(/\r?\n/).map(parseCsvLine);
}

/**
 * Parse Zoom's date format: "DD-MM-YYYY HH:MM:SS AM/PM"
 * Falls back to standard Date parsing, then to now().
 */
function parseZoomDate(s: string): string {
  if (!s) return new Date().toISOString();

  // Try DD-MM-YYYY HH:MM:SS AM/PM (e.g. "26-01-2026 03:54:59 PM")
  const ddmm = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})\s+(.+)$/);
  if (ddmm) {
    const [, dd, mm, yyyy, timePart] = ddmm;
    // Reorder to MM/DD/YYYY which JS Date can parse reliably
    const d = new Date(`${mm}/${dd}/${yyyy} ${timePart}`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Standard fallback
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Extract email from Zoom's "Full Name (email@example.com)" host field.
 */
function extractHostEmail(field: string): string | null {
  const m = field.match(/\(([^)@\s]+@[^)\s]+)\)/);
  return m ? m[1] : null;
}

// ── Upload Zoom CSV ───────────────────────────────────────────────────────────

export async function uploadZoomAttendance(formData: FormData): Promise<AttResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const cohortId   = formData.get("cohort_id")    as string;
  const weekNumber = parseInt(formData.get("week_number")    as string, 10);
  const sessionNo  = parseInt(formData.get("session_number") as string, 10);
  const file       = formData.get("csv_file") as File | null;

  if (!cohortId || isNaN(weekNumber) || isNaN(sessionNo) || !file) {
    return { error: "Week number, session number and CSV file are all required." };
  }

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("id, level, attendance_present_pct, attendance_partial_pct")
    .eq("id", cohortId)
    .single();
  if (!cohort) return { error: "Cohort not found" };

  const isPractitioner = cohort.level === "practitioner";
  const presentPct     = cohort.attendance_present_pct ?? 75;
  const partialPct     = cohort.attendance_partial_pct  ?? 50;

  const text = await file.text();
  const rows = parseCsv(text).filter((r) => r.some((c) => c.length > 0));

  // ── Locate participant section header ──────────────────────────────────────
  // Look for a row that has both an email-like column and a duration column.
  let participantHeaderIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const lower = rows[i].map((c) => c.toLowerCase());
    if (lower.some((c) => c === "email" || c.includes("user email")) &&
        lower.some((c) => c.includes("duration"))) {
      participantHeaderIdx = i;
      break;
    }
  }
  if (participantHeaderIdx === -1) {
    return { error: "Could not find participant section. Please upload a Zoom attendance report CSV." };
  }

  // ── Parse meta section (row 0 = headers, row 1 = values) ──────────────────
  const metaHeaders = (rows[0] ?? []).map((h) => h.toLowerCase().trim());
  const metaValues  = rows[1] ?? [];
  const meta: Record<string, string> = {};
  metaHeaders.forEach((h, i) => { if (h) meta[h] = metaValues[i] ?? ""; });

  const topic      = meta["topic"] ?? `Week ${weekNumber} Session ${sessionNo}`;
  const startStr   = meta["start time"] ?? "";
  const durStr     = meta["duration (minutes)"] ?? meta["duration"] ?? "";
  // Host field may be "Name (email)" or just an email
  const hostRaw    = meta["host"] ?? meta["user email"] ?? "";
  const hostEmail  = hostRaw.includes("@")
    ? (hostRaw.includes("(") ? extractHostEmail(hostRaw) : hostRaw)
    : null;

  const startedAt = parseZoomDate(startStr);
  const totalMins = (() => {
    const n = parseInt(durStr, 10);
    return isNaN(n) || n <= 0 ? 60 : n;
  })();

  // ── Parse participants ─────────────────────────────────────────────────────
  const partHeaders = rows[participantHeaderIdx].map((h) => h.toLowerCase().trim());
  const emailCol    = partHeaders.findIndex((h) => h === "email" || h.includes("user email"));
  const durationCol = partHeaders.findIndex((h) =>
    h.includes("total duration") || (h.includes("duration") && !h.includes("meeting")));

  if (emailCol === -1 || durationCol === -1) {
    return { error: "Participant section is missing Email or Duration columns." };
  }

  // Collect all rows that have a non-empty email.
  // NOTE: Do NOT filter by the "Guest" column — in Zoom, trainees who join
  // from outside the host organisation are marked Guest=Yes. Only skip rows
  // with no email at all (those are Zoom bots / unnamed participants).
  const participants: { email: string; durationMins: number }[] = [];
  for (let i = participantHeaderIdx + 1; i < rows.length; i++) {
    const row   = rows[i];
    const email = (row[emailCol] ?? "").trim();
    const dur   = parseInt((row[durationCol] ?? "").trim(), 10);
    if (!email) continue;   // skip bots / unnamed
    participants.push({ email, durationMins: isNaN(dur) ? 0 : dur });
  }

  if (!participants.length) {
    return { error: "No participants found. Check that trainee emails appear in the CSV." };
  }

  // ── Match trainees ─────────────────────────────────────────────────────────
  const { data: trainees } = await supabase
    .from("trainees")
    .select("id, personal_email, amalitech_email")
    .eq("cohort_id", cohortId)
    .is("deleted_at", null)
    .eq("status", "active");

  const traineeEmailMap = new Map<string, string>();
  for (const t of trainees ?? []) {
    if (t.personal_email)  traineeEmailMap.set(t.personal_email.toLowerCase(), t.id);
    if (t.amalitech_email) traineeEmailMap.set(t.amalitech_email.toLowerCase(), t.id);
  }

  // ── Create session ─────────────────────────────────────────────────────────
  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .insert({
      cohort_id:           cohortId,
      platform:            "zoom",
      topic,
      host_email:          hostEmail,
      started_at:          startedAt,
      total_duration_mins: totalMins,
      week_number:         weekNumber,
      session_number:      sessionNo,
    })
    .select("id")
    .single();

  if (sessErr || !session) return { error: sessErr?.message ?? "Failed to create session" };

  // ── Build attendance rows for ALL active trainees ──────────────────────────
  // Trainees not found in the CSV are marked absent.
  const attendanceRows = (trainees ?? []).map((t) => {
    const found = participants.find(
      (p) => traineeEmailMap.get(p.email.toLowerCase()) === t.id,
    );
    const durationMins = found?.durationMins ?? 0;
    return {
      session_id:         session.id,
      trainee_id:         t.id,
      duration_mins:      durationMins,
      total_session_mins: totalMins,
      status:             statusFromDuration(durationMins, totalMins, isPractitioner, presentPct, partialPct),
    };
  });

  const { error: attErr } = await supabase
    .from("attendance")
    .upsert(attendanceRows, { onConflict: "session_id,trainee_id" });

  if (attErr) {
    await supabase.from("sessions").delete().eq("id", session.id);
    return { error: attErr.message };
  }

  revalidatePath(`/trainer/cohorts/${cohortId}`);
  revalidatePath(`/trainer/cohorts/${cohortId}/attendance`);
  return {};
}

// ── Create Teams Session ──────────────────────────────────────────────────────

export async function createTeamsSession(
  formData: FormData,
): Promise<AttResult & { sessionId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const cohortId   = formData.get("cohort_id")          as string;
  const topic      = (formData.get("topic") as string)?.trim();
  const weekNumber = parseInt(formData.get("week_number")    as string, 10);
  const sessionNo  = parseInt(formData.get("session_number") as string, 10);
  const startedAt  = formData.get("started_at")          as string;
  const totalMins  = parseInt(formData.get("total_duration_mins") as string, 10);

  if (!cohortId || !topic || isNaN(weekNumber) || isNaN(sessionNo) || !startedAt || isNaN(totalMins) || totalMins <= 0) {
    return { error: "All fields are required and duration must be a positive number." };
  }

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({
      cohort_id:           cohortId,
      platform:            "teams",
      topic,
      started_at:          new Date(startedAt).toISOString(),
      total_duration_mins: totalMins,
      week_number:         weekNumber,
      session_number:      sessionNo,
    })
    .select("id")
    .single();

  if (error || !session) return { error: error?.message ?? "Failed to create session" };

  revalidatePath(`/trainer/cohorts/${cohortId}/attendance`);
  return { sessionId: session.id };
}

// ── Save Manual Attendance ────────────────────────────────────────────────────

export async function saveManualAttendance(formData: FormData): Promise<AttResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const cohortId  = formData.get("cohort_id")           as string;
  const sessionId = formData.get("session_id")          as string;
  const totalMins = parseInt(formData.get("total_duration_mins") as string, 10);

  if (!cohortId || !sessionId || isNaN(totalMins)) return { error: "Missing required fields." };

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("level, attendance_present_pct, attendance_partial_pct")
    .eq("id", cohortId)
    .single();

  const isPractitioner = cohort?.level === "practitioner";
  const presentPct     = cohort?.attendance_present_pct ?? 75;
  const partialPct     = cohort?.attendance_partial_pct  ?? 50;

  const rows: {
    session_id: string; trainee_id: string;
    duration_mins: number; total_session_mins: number;
    status: "present" | "partial" | "brief" | "absent";
  }[] = [];

  for (const [key, val] of formData.entries()) {
    if (!key.startsWith("duration_")) continue;
    const traineeId    = key.slice("duration_".length);
    const durationMins = parseInt(val as string, 10);
    if (!traineeId || isNaN(durationMins)) continue;
    const dur = Math.max(0, durationMins);
    rows.push({
      session_id:         sessionId,
      trainee_id:         traineeId,
      duration_mins:      dur,
      total_session_mins: totalMins,
      status:             statusFromDuration(dur, totalMins, isPractitioner, presentPct, partialPct),
    });
  }

  if (!rows.length) return { error: "No attendance data provided." };

  const { error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "session_id,trainee_id" });

  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}/attendance`);
  revalidatePath(`/trainer/cohorts/${cohortId}`);
  return {};
}

// ── Upload Teams Attendance CSV ───────────────────────────────────────────────

export async function uploadTeamsAttendanceCsv(formData: FormData): Promise<AttResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const cohortId  = formData.get("cohort_id")  as string;
  const sessionId = formData.get("session_id") as string;
  const file      = formData.get("csv_file")   as File | null;

  if (!cohortId || !sessionId || !file) return { error: "Missing required fields." };

  const { data: session } = await supabase
    .from("sessions")
    .select("total_duration_mins")
    .eq("id", sessionId)
    .single();
  if (!session) return { error: "Session not found." };

  const totalMins = session.total_duration_mins;

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("level, attendance_present_pct, attendance_partial_pct")
    .eq("id", cohortId)
    .single();

  const isPractitioner = cohort?.level === "practitioner";
  const presentPct     = cohort?.attendance_present_pct ?? 75;
  const partialPct     = cohort?.attendance_partial_pct  ?? 50;

  const text = await file.text();
  const rows = parseCsv(text).filter((r) => r.some((c) => c.length > 0));
  if (rows.length < 2) return { error: "CSV file is empty." };

  const headers  = rows[0].map((h) => h.toLowerCase().trim());
  const emailCol = headers.findIndex((h) => h === "email");
  const durCol   = headers.findIndex((h) => h.includes("duration"));

  if (emailCol === -1 || durCol === -1) {
    return { error: "CSV must have 'Email' and 'Duration (Minutes)' columns." };
  }

  const { data: trainees } = await supabase
    .from("trainees")
    .select("id, personal_email, amalitech_email")
    .eq("cohort_id", cohortId)
    .is("deleted_at", null)
    .eq("status", "active");

  const traineeEmailMap = new Map<string, string>();
  for (const t of trainees ?? []) {
    if (t.personal_email)  traineeEmailMap.set(t.personal_email.toLowerCase(), t.id);
    if (t.amalitech_email) traineeEmailMap.set(t.amalitech_email.toLowerCase(), t.id);
  }

  const attendanceRows: {
    session_id: string; trainee_id: string;
    duration_mins: number; total_session_mins: number;
    status: "present" | "partial" | "brief" | "absent";
  }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row      = rows[i];
    const email    = (row[emailCol] ?? "").trim().toLowerCase();
    const dur      = parseInt((row[durCol] ?? "").trim(), 10);
    if (!email) continue;
    const traineeId = traineeEmailMap.get(email);
    if (!traineeId) continue;
    const durationMins = isNaN(dur) ? 0 : Math.max(0, dur);
    attendanceRows.push({
      session_id:         sessionId,
      trainee_id:         traineeId,
      duration_mins:      durationMins,
      total_session_mins: totalMins,
      status:             statusFromDuration(durationMins, totalMins, isPractitioner, presentPct, partialPct),
    });
  }

  if (!attendanceRows.length) {
    return { error: "No matching trainees found in the uploaded CSV." };
  }

  const { error } = await supabase
    .from("attendance")
    .upsert(attendanceRows, { onConflict: "session_id,trainee_id" });

  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}/attendance`);
  revalidatePath(`/trainer/cohorts/${cohortId}`);
  return {};
}

// ── Update Attendance Thresholds ──────────────────────────────────────────────

export async function updateAttendanceThresholds(
  cohortId: string,
  presentPct: number,
  partialPct: number,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSuperAdmin = profile?.role === "super_admin";

  if (!isSuperAdmin) {
    const { data: access } = await supabase
      .from("cohort_access")
      .select("id")
      .eq("cohort_id", cohortId)
      .eq("trainer_id", user.id)
      .single();
    if (!access) return { error: "Access denied" };
  }

  const present = Math.min(100, Math.max(1, Math.round(presentPct)));
  const partial = Math.min(100, Math.max(1, Math.round(partialPct)));

  if (partial >= present) return { error: "Partial threshold must be less than Present threshold" };

  const service = createServiceClient();
  const { error } = await service
    .from("cohorts")
    .update({ attendance_present_pct: present, attendance_partial_pct: partial })
    .eq("id", cohortId);

  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}`);
  revalidatePath(`/trainer/cohorts/${cohortId}/attendance`);
  return { success: true };
}

// ── Delete Session ────────────────────────────────────────────────────────────

export async function deleteSession(sessionId: string, cohortId: string): Promise<AttResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId);

  if (error) return { error: error.message };

  revalidatePath(`/trainer/cohorts/${cohortId}/attendance`);
  revalidatePath(`/trainer/cohorts/${cohortId}`);
  return {};
}
