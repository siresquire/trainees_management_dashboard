/**
 * Canvas → Supabase sync script
 * Runs via GitHub Actions daily. Fetches all active Canvas cohorts,
 * pulls assignment submissions + "Graduated" custom column, upserts completions.
 */

import { createClient } from "@supabase/supabase-js";
import { createDecipheriv, scryptSync } from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Encryption helpers ────────────────────────────────────────────────────
function deriveKey() {
  return scryptSync(process.env.ENCRYPTION_SECRET, "amalitech-salt-v1", 32);
}

function decrypt(ciphertext) {
  const key = deriveKey();
  const [ivHex, tagHex, encHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc).toString("utf8") + decipher.final("utf8");
}

// ── Canvas API helpers ────────────────────────────────────────────────────
async function canvasFetchAll(baseUrl, token, path) {
  const results = [];
  let url = `${baseUrl}/api/v1${path}`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Canvas API ${url} → ${res.status}`);
    results.push(...await res.json());
    const link = res.headers.get("Link") ?? "";
    url = link.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  }
  return results;
}

function normaliseName(raw) {
  return raw.replace(/\s*\(\d+\)\s*$/, "").trim();
}

// ── Main per-cohort sync ──────────────────────────────────────────────────
async function syncCohort(cohort) {
  const token = decrypt(cohort.canvas_api_token_encrypted);
  const canvasBase = "https://awsrestart.instructure.com";
  const courseId = cohort.canvas_course_id;

  console.log(`\nSyncing cohort: ${cohort.name} (course ${courseId})`);

  // 1. Assignments
  const assignments = await canvasFetchAll(canvasBase, token, `/courses/${courseId}/assignments?per_page=100`);
  const assignmentMap = new Map(assignments.map((a) => [a.id, normaliseName(a.name)]));

  // 2. Cohort week tasks
  const { data: tasks } = await supabase
    .from("cohort_week_tasks")
    .select("id, task_name, task_type")
    .eq("cohort_id", cohort.id);
  const taskMap = new Map((tasks ?? []).map((t) => [t.task_name.trim(), t]));

  // 3. Trainees (both email types → trainee_id)
  const { data: trainees } = await supabase
    .from("trainees")
    .select("id, personal_email, amalitech_email")
    .eq("cohort_id", cohort.id)
    .eq("status", "active");

  const traineeByEmail = new Map();
  const traineeById = new Map((trainees ?? []).map((t) => [t.id, t]));
  for (const t of trainees ?? []) {
    if (t.personal_email)  traineeByEmail.set(t.personal_email.toLowerCase(), t.id);
    if (t.amalitech_email) traineeByEmail.set(t.amalitech_email.toLowerCase(), t.id);
  }

  // 4. Enrollments (Canvas user_id → email)
  const enrollments = await canvasFetchAll(canvasBase, token,
    `/courses/${courseId}/enrollments?type[]=StudentEnrollment&per_page=100`);
  const userEmailMap = new Map();
  for (const e of enrollments) {
    if (e.user?.login_id) userEmailMap.set(e.user_id, e.user.login_id.toLowerCase());
  }

  // 5. Submissions → completions
  const submissions = await canvasFetchAll(canvasBase, token,
    `/courses/${courseId}/students/submissions?student_ids[]=all&per_page=100`);

  const upserts = [];
  for (const sub of submissions) {
    const assignmentName = assignmentMap.get(sub.assignment_id);
    if (!assignmentName) continue;
    const task = taskMap.get(assignmentName);
    if (!task) continue;

    const email = userEmailMap.get(sub.user_id) ?? sub.sis_login_id?.toLowerCase();
    if (!email) continue;
    const traineeId = traineeByEmail.get(email);
    if (!traineeId) continue;

    const score = sub.score != null ? parseFloat(sub.score) : null;
    if (task.task_type === "kc" && score === null) continue;
    if (task.task_type === "lab" && score !== 1) continue;

    upserts.push({
      trainee_id: traineeId,
      task_id: task.id,
      score: task.task_type === "kc" ? score : null,
      completed_at: sub.submitted_at ?? sub.graded_at,
      source: "canvas",
    });
  }

  if (upserts.length) {
    const { error } = await supabase.from("completions").upsert(upserts, { onConflict: "trainee_id,task_id" });
    if (error) console.error(`  Upsert completions error: ${error.message}`);
    else console.log(`  ✓ Upserted ${upserts.length} completions`);
  } else {
    console.log("  No new completions");
  }

  // 6. "Graduated" — regular Canvas assignment (1 pt = graduated).
  //    Exported as "Graduated (id)" in the gradebook CSV.
  //    Use already-fetched assignments + submissions; no extra API call needed.
  try {
    const gradAssignment = assignments.find(
      (a) => normaliseName(a.name).toLowerCase() === "graduated"
    );

    if (gradAssignment) {
      const graduatedIds = new Set();
      const notGraduatedIds = new Set();

      for (const sub of submissions) {
        if (sub.assignment_id !== gradAssignment.id) continue;
        const email = userEmailMap.get(sub.user_id) ?? sub.sis_login_id?.toLowerCase();
        if (!email) continue;
        const traineeId = traineeByEmail.get(email);
        if (!traineeId) continue;
        const score = sub.score != null ? parseFloat(sub.score) : null;
        if (score !== null && score >= 1) {
          graduatedIds.add(traineeId);
        } else {
          notGraduatedIds.add(traineeId);
        }
      }

      if (graduatedIds.size) {
        const { error } = await supabase
          .from("trainees")
          .update({ graduated: true })
          .in("id", [...graduatedIds]);
        if (error) console.error(`  Graduated update error: ${error.message}`);
        else console.log(`  ✓ Marked ${graduatedIds.size} trainee(s) as graduated`);
      }
      if (notGraduatedIds.size) {
        await supabase
          .from("trainees")
          .update({ graduated: false })
          .in("id", [...notGraduatedIds])
          .eq("graduated", true);
      }
      console.log(`  Graduated: ${graduatedIds.size} marked, ${notGraduatedIds.size} not graduated`);
    } else {
      console.log("  No 'Graduated' assignment found in Canvas course — skipping");
    }
  } catch (err) {
    console.error(`  Graduated sync error: ${err.message}`);
  }

  // Stamp last sync time
  await supabase.from("cohorts").update({ last_canvas_sync_at: new Date().toISOString() }).eq("id", cohort.id);
}

async function main() {
  console.log("=== Canvas Sync Started ===", new Date().toISOString());

  const { data: cohorts, error } = await supabase
    .from("cohorts")
    .select("id, name, canvas_course_id, canvas_api_token_encrypted")
    .eq("platform", "canvas")
    .in("status", ["active", "completed"])
    .not("canvas_api_token_encrypted", "is", null);

  if (error) throw error;
  if (!cohorts?.length) { console.log("No active Canvas cohorts."); return; }

  for (const cohort of cohorts) {
    try {
      await syncCohort(cohort);
    } catch (err) {
      console.error(`  ✗ Failed cohort ${cohort.name}: ${err.message}`);
    }
  }

  console.log("\n=== Canvas Sync Complete ===", new Date().toISOString());
}

main().catch((err) => { console.error(err); process.exit(1); });
