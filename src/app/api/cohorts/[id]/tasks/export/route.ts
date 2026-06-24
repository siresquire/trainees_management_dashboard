import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: cohortId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin" && profile?.role !== "admin") {
    const { data: access } = await supabase
      .from("cohort_access")
      .select("id")
      .eq("cohort_id", cohortId)
      .eq("trainer_id", user.id)
      .maybeSingle();
    if (!access) return new Response("Forbidden", { status: 403 });
  }

  const svc = createServiceClient();

  const { data: cohort } = await svc
    .from("cohorts")
    .select("name, code_name, level")
    .eq("id", cohortId)
    .single();

  const { data: tasks } = await svc
    .from("cohort_week_tasks")
    .select("id, week_number, task_name, task_type, display_order")
    .eq("cohort_id", cohortId)
    .order("week_number")
    .order("display_order");

  if (!tasks?.length) {
    return new Response("No tasks found for this cohort", { status: 404 });
  }

  const [{ data: trainees }, { data: completions }] = await Promise.all([
    svc
      .from("trainees")
      .select("id, full_name, serial_no, amalitech_email")
      .eq("cohort_id", cohortId)
      .in("status", ["active", "completed"])
      .is("deleted_at", null)
      .order("serial_no"),
    svc
      .from("completions")
      .select("trainee_id, task_id")
      .in("task_id", tasks.map((t) => t.id))
      .limit(50000),
  ]);

  const doneSet = new Set(
    (completions ?? []).map((c) => `${c.trainee_id}:${c.task_id}`)
  );

  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const includeEmail = cohort?.level !== "practitioner";

  const header = [
    "Week", "Task Type", "Task Name", "#", "Trainee Name",
    ...(includeEmail ? ["Amalitech Email"] : []),
    "Status",
  ].join(",");

  const rows: string[] = [header];

  for (const task of tasks) {
    for (const t of trainees ?? []) {
      rows.push([
        task.week_number,
        task.task_type,
        esc(task.task_name),
        t.serial_no ?? "",
        esc(t.full_name),
        ...(includeEmail ? [t.amalitech_email ?? ""] : []),
        doneSet.has(`${t.id}:${task.id}`) ? "Completed" : "Pending",
      ].join(","));
    }
  }

  const slug = (cohort?.code_name ?? cohort?.name ?? cohortId).replace(/[^a-z0-9]/gi, "_");
  const date = new Date().toISOString().slice(0, 10);

  // ﻿ is the UTF-8 BOM — tells Excel to open as UTF-8 instead of Windows-1252,
  // preventing em dashes and other non-ASCII characters from appearing garbled.
  return new Response("﻿" + rows.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}_tasks_${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
