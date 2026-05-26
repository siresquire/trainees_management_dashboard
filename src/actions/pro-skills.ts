"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ── Access guard ────────────────────────────────────────────────────────────
async function assertProSkillsAccess(cohortId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();

  if (["super_admin", "admin"].includes(profile?.role ?? "")) return user;

  // trainer owners also have access
  if (profile?.role === "trainer") {
    const { data: access } = await supabase
      .from("cohort_access").select("role")
      .eq("cohort_id", cohortId).eq("trainer_id", user.id).maybeSingle();
    if (access) return user;
  }

  // pro_skills_instructor with cohort_access.role = 'pro_skills'
  const { data: psAccess } = await supabase
    .from("cohort_access").select("role")
    .eq("cohort_id", cohortId).eq("trainer_id", user.id).eq("role", "pro_skills").maybeSingle();
  if (!psAccess) throw new Error("Not authorised");
  return user;
}

// ── Helper: only super_admin / admin / trainer owner ────────────────────────
async function assertAdminOrOwner(cohortId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();

  if (["super_admin", "admin"].includes(profile?.role ?? "")) return user;

  const { data: access } = await supabase
    .from("cohort_access").select("role")
    .eq("cohort_id", cohortId).eq("trainer_id", user.id).eq("role", "owner").maybeSingle();
  if (!access) throw new Error("Not authorised");
  return user;
}

// ── Sessions ────────────────────────────────────────────────────────────────

export async function createProSkillsSession(
  cohortId: string,
  data: { title: string; session_date: string; topic?: string }
): Promise<{ error?: string } | { success: true }> {
  try {
    const user = await assertProSkillsAccess(cohortId);
    const svc = createServiceClient();
    const { error } = await svc.from("pro_skills_sessions").insert({
      cohort_id:     cohortId,
      instructor_id: user.id,
      title:         data.title,
      session_date:  data.session_date,
      topic:         data.topic ?? null,
    });
    if (error) return { error: error.message };
    revalidatePath(`/pro-skills/cohorts/${cohortId}/sessions`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteProSkillsSession(
  sessionId: string,
  cohortId: string
): Promise<{ error?: string } | { success: true }> {
  try {
    await assertProSkillsAccess(cohortId);
    const svc = createServiceClient();
    const { error } = await svc
      .from("pro_skills_sessions")
      .delete()
      .eq("id", sessionId);
    if (error) return { error: error.message };
    revalidatePath(`/pro-skills/cohorts/${cohortId}/sessions`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function saveProSkillsAttendance(
  sessionId: string,
  cohortId: string,
  records: { trainee_id: string; status: string }[]
): Promise<{ error?: string } | { success: true }> {
  try {
    await assertProSkillsAccess(cohortId);
    if (!records.length) return { success: true };
    const svc = createServiceClient();
    const rows = records.map((r) => ({
      session_id: sessionId,
      trainee_id: r.trainee_id,
      status:     r.status,
    }));
    const { error } = await svc
      .from("pro_skills_attendance")
      .upsert(rows, { onConflict: "session_id,trainee_id" });
    if (error) return { error: error.message };
    revalidatePath(`/pro-skills/cohorts/${cohortId}/sessions`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function uploadProSkillsAttendanceCsv(
  sessionId: string,
  cohortId: string,
  csvText: string
): Promise<{ error?: string } | { success: true; matched: number }> {
  try {
    await assertProSkillsAccess(cohortId);

    // Fetch trainees in cohort
    const svc = createServiceClient();
    const { data: trainees, error: tErr } = await svc
      .from("trainees")
      .select("id, personal_email, amalitech_email")
      .eq("cohort_id", cohortId)
      .is("deleted_at", null);
    if (tErr) return { error: tErr.message };

    // Build email → trainee id map
    const emailMap = new Map<string, string>();
    for (const t of trainees ?? []) {
      if (t.personal_email)  emailMap.set(t.personal_email.toLowerCase(),  t.id);
      if (t.amalitech_email) emailMap.set(t.amalitech_email.toLowerCase(), t.id);
    }

    // Parse CSV: find Email column
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { error: "CSV file is empty or has no data rows." };

    const headerLine = lines[0];
    const headers = headerLine.split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
    const emailCol = headers.findIndex((h) => h === "email" || h === "email address");
    if (emailCol === -1) return { error: "CSV must have an 'Email' column." };

    const presentEmails = new Set<string>();
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const email = cols[emailCol]?.toLowerCase();
      if (email) presentEmails.add(email);
    }

    // Build upsert rows: present if email found, absent otherwise
    const rows = (trainees ?? []).map((t) => {
      const emails = [t.personal_email?.toLowerCase(), t.amalitech_email?.toLowerCase()].filter(Boolean) as string[];
      const isPresent = emails.some((e) => presentEmails.has(e));
      return {
        session_id: sessionId,
        trainee_id: t.id,
        status:     isPresent ? "present" : "absent",
      };
    });

    if (!rows.length) return { error: "No trainees found in this cohort." };

    const { error } = await svc
      .from("pro_skills_attendance")
      .upsert(rows, { onConflict: "session_id,trainee_id" });
    if (error) return { error: error.message };

    const matched = rows.filter((r) => r.status === "present").length;
    revalidatePath(`/pro-skills/cohorts/${cohortId}/sessions`);
    return { success: true, matched };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ── Assignments ─────────────────────────────────────────────────────────────

export async function createProSkillsAssignment(
  cohortId: string,
  data: { title: string; description?: string; due_date?: string }
): Promise<{ error?: string } | { success: true }> {
  try {
    const user = await assertProSkillsAccess(cohortId);
    const svc = createServiceClient();
    const { error } = await svc.from("pro_skills_assignments").insert({
      cohort_id:     cohortId,
      instructor_id: user.id,
      title:         data.title,
      description:   data.description ?? null,
      due_date:      data.due_date ?? null,
    });
    if (error) return { error: error.message };
    revalidatePath(`/pro-skills/cohorts/${cohortId}/assignments`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteProSkillsAssignment(
  assignmentId: string,
  cohortId: string
): Promise<{ error?: string } | { success: true }> {
  try {
    await assertProSkillsAccess(cohortId);
    const svc = createServiceClient();
    const { error } = await svc
      .from("pro_skills_assignments")
      .delete()
      .eq("id", assignmentId);
    if (error) return { error: error.message };
    revalidatePath(`/pro-skills/cohorts/${cohortId}/assignments`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function toggleProSkillsSubmission(
  assignmentId: string,
  traineeId: string,
  cohortId: string,
  completed: boolean
): Promise<{ error?: string } | { success: true }> {
  try {
    await assertProSkillsAccess(cohortId);
    const svc = createServiceClient();
    const { error } = await svc
      .from("pro_skills_submissions")
      .upsert(
        {
          assignment_id: assignmentId,
          trainee_id:    traineeId,
          completed,
          completed_at:  completed ? new Date().toISOString() : null,
        },
        { onConflict: "assignment_id,trainee_id" }
      );
    if (error) return { error: error.message };
    revalidatePath(`/pro-skills/cohorts/${cohortId}/assignments`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ── Instructor management ────────────────────────────────────────────────────

export async function assignProSkillsInstructor(
  cohortId: string,
  email: string
): Promise<{ error?: string } | { success: true }> {
  try {
    await assertAdminOrOwner(cohortId);
    const svc = createServiceClient();

    // Look up profile by email via the security-definer RPC
    const { data: rows, error: rpcErr } = await svc.rpc("get_profile_by_email", {
      p_email: email.trim().toLowerCase(),
    });
    if (rpcErr) return { error: rpcErr.message };
    const profileRow = rows?.[0];
    if (!profileRow) return { error: "No account found for this email address." };
    if (profileRow.role !== "pro_skills_instructor") {
      return { error: "This user does not have the pro_skills_instructor role." };
    }

    const { error } = await svc
      .from("cohort_access")
      .upsert(
        { cohort_id: cohortId, trainer_id: profileRow.user_id, role: "pro_skills" },
        { onConflict: "cohort_id,trainer_id,role" }
      );
    if (error) return { error: error.message };

    revalidatePath(`/trainer/cohorts/${cohortId}/settings`);
    revalidatePath(`/pro-skills/dashboard`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function removeProSkillsInstructor(
  cohortId: string,
  instructorId: string
): Promise<{ error?: string } | { success: true }> {
  try {
    await assertAdminOrOwner(cohortId);
    const svc = createServiceClient();

    const { error } = await svc
      .from("cohort_access")
      .delete()
      .eq("cohort_id", cohortId)
      .eq("trainer_id", instructorId)
      .eq("role", "pro_skills");
    if (error) return { error: error.message };

    revalidatePath(`/trainer/cohorts/${cohortId}/settings`);
    revalidatePath(`/pro-skills/dashboard`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
