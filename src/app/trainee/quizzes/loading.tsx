export default function QuizzesLoading() {
  return (
    <div className="p-4 md:p-8 max-w-3xl animate-pulse">
      <div className="h-7 w-32 bg-slate-200 rounded-lg mb-6" />
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 px-4 py-4 flex items-center justify-between">
            <div className="flex-1">
              <div className="h-4 w-48 bg-slate-200 rounded mb-2" />
              <div className="h-3 w-24 bg-slate-100 rounded" />
            </div>
            <div className="h-7 w-16 bg-slate-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
