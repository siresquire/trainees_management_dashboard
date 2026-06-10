/**
 * At-Risk Trainee Report → Slack
 *
 * Flags trainees who, measured cumulatively through the cohort's CURRENT week:
 *   • have completed < 80% of lab tasks assigned so far, or
 *   • have completed < 80% of KC tasks assigned so far, or
 *   • have attended  < 70% of sessions held so far
 * and posts a per-cohort summary to a Slack channel via incoming webhook.
 *
 * Heavy lifting is done by the get_admin_at_risk() Postgres function
 * (migration 20260606000004) — the same source the dashboard column uses.
 *
 * Required env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SLACK_WEBHOOK_URL
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!SLACK_WEBHOOK) {
  console.error("Missing SLACK_WEBHOOK_URL");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

/** Fetch every page of a result PostgREST would cap at ~1000 rows. */
async function fetchAll(buildQuery) {
  const SIZE = 1000;
  const all = [];
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await buildQuery().range(from, from + SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < SIZE) break;
  }
  return all;
}

const pct = (done, total) => (total > 0 ? Math.round((done / total) * 100) : null);

async function main() {
  // 1. Active cohorts
  const { data: cohorts, error: cohortErr } = await supabase
    .from("cohorts")
    .select("id, name, code_name, level")
    .eq("status", "active")
    .order("code_name");
  if (cohortErr) throw new Error(cohortErr.message);
  const cohortIds = (cohorts ?? []).map((c) => c.id);
  if (!cohortIds.length) {
    console.log("No active cohorts — nothing to report.");
    return;
  }

  // 2. Cohort owners (trainer names)
  const { data: ownerAccess } = await supabase
    .from("cohort_access")
    .select("cohort_id, trainer_id")
    .eq("role", "owner")
    .in("cohort_id", cohortIds);
  const ownerIds = [...new Set((ownerAccess ?? []).map((o) => o.trainer_id))];
  const { data: ownerProfiles } = ownerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ownerIds)
    : { data: [] };
  const nameById = new Map((ownerProfiles ?? []).map((p) => [p.id, p.full_name]));
  const trainerByCohort = new Map();
  for (const o of ownerAccess ?? []) {
    if (!trainerByCohort.has(o.cohort_id)) {
      const n = nameById.get(o.trainer_id);
      if (n) trainerByCohort.set(o.cohort_id, n);
    }
  }

  // 3. At-risk trainees
  const atRisk = await fetchAll(() =>
    supabase.rpc("get_admin_at_risk", { p_cohort_ids: cohortIds })
  );

  // 4. Group per cohort
  const byCohort = new Map();
  for (const r of atRisk) {
    const list = byCohort.get(r.cohort_id) ?? [];
    list.push(r);
    byCohort.set(r.cohort_id, list);
  }

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  // 5. Build Slack blocks
  const blocks = [];
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: `🚨 At-Risk Trainee Report — ${today}`, emoji: true },
  });
  blocks.push({
    type: "context",
    elements: [{
      type: "mrkdwn",
      text: "Flagged when below *80%* of Labs or KCs assigned cumulatively through the cohort's current week, or below *70%* attendance. 🧪 = labs behind · 📝 = KCs behind · 📅 = low attendance",
    }],
  });

  let totalFlagged = 0;

  for (const c of cohorts ?? []) {
    const list = byCohort.get(c.id);
    if (!list?.length) continue;
    totalFlagged += list.length;

    const trainer = trainerByCohort.get(c.id);
    const week    = list[0]?.current_week;
    const code    = c.code_name ?? c.name;

    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${code}* · ${c.name}${trainer ? ` · Trainer: *${trainer}*` : ""}\nWeek ${week ?? "?"} · *${list.length} trainee${list.length !== 1 ? "s" : ""} at risk*`,
      },
    });

    // Trainee lines, chunked to stay under Slack's 3000-char section limit
    const lines = list.map((t) => {
      const labP = pct(t.labs_done, t.labs_expected);
      const kcP  = pct(t.kcs_done,  t.kcs_expected);
      const attP = pct(t.att_done,  t.att_total);
      const flags = [
        labP !== null && labP < 80 ? "🧪" : "",
        kcP  !== null && kcP  < 80 ? "📝" : "",
        attP !== null && attP < 70 ? "📅" : "",
      ].join("");
      const parts = [];
      if (labP !== null) parts.push(`Labs ${t.labs_done}/${t.labs_expected} (${labP}%)`);
      if (kcP  !== null) parts.push(`KCs ${t.kcs_done}/${t.kcs_expected} (${kcP}%)`);
      if (attP !== null) parts.push(`Att ${t.att_done}/${t.att_total} (${attP}%)`);
      return `• ${flags} *${t.full_name}* — ${parts.join(" · ")}`;
    });

    const CHUNK = 12;
    for (let i = 0; i < lines.length; i += CHUNK) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: lines.slice(i, i + CHUNK).join("\n") },
      });
    }
  }

  if (totalFlagged === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "✅ *No at-risk trainees this week.* Everyone is on track." },
    });
  }

  // 6. Send to Slack — chunk into multiple messages if over the 50-block cap
  const MAX_BLOCKS = 45;
  for (let i = 0; i < blocks.length; i += MAX_BLOCKS) {
    const payload = {
      text: `At-Risk Trainee Report — ${totalFlagged} trainee(s) flagged`,
      blocks: blocks.slice(i, i + MAX_BLOCKS),
    };
    const res = await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Slack webhook failed (${res.status}): ${body}`);
    }
  }

  console.log(`Report sent — ${totalFlagged} at-risk trainee(s) across ${byCohort.size} cohort(s).`);
}

main().catch((e) => {
  console.error("At-risk report failed:", e.message);
  process.exit(1);
});
