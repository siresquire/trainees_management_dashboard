import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ProSkillsCohortTraineesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: trainees } = await supabase
    .from("trainees")
    .select("id, full_name, personal_email, amalitech_email")
    .eq("cohort_id", id)
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  const list = trainees ?? [];

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Trainees <span className="text-slate-400 font-normal ml-1">({list.length})</span>
        </h2>
      </div>

      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-400">No trainees in this cohort yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Personal Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Amalitech Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {list.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{t.full_name}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{t.personal_email}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{t.amalitech_email ?? <span className="text-slate-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
