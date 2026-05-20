export default function TrainerDashboardLoading() {
  return (
    <div className="p-4 md:p-8 animate-pulse">
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div className="space-y-2">
          <div className="h-7 w-28 bg-slate-200 rounded-lg" />
          <div className="h-4 w-56 bg-slate-100 rounded" />
        </div>
        <div className="h-9 w-28 bg-slate-200 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div className="h-5 w-24 bg-slate-100 rounded-full" />
              <div className="h-5 w-16 bg-slate-100 rounded-full" />
            </div>
            <div className="space-y-2">
              <div className="h-5 w-3/4 bg-slate-200 rounded" />
              <div className="h-3.5 w-20 bg-slate-100 rounded font-mono" />
              <div className="h-3.5 w-44 bg-slate-100 rounded" />
            </div>
            <div className="flex flex-col gap-2 mt-auto">
              <div className="h-4 w-40 bg-slate-100 rounded" />
              <div className="h-4 w-32 bg-slate-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
