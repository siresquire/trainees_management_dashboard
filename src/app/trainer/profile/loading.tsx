export default function Loading() {
  return (
    <div className="max-w-xl space-y-6 p-4 md:p-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-5 w-32 bg-slate-200 rounded" />
        <div className="h-3 w-52 bg-slate-100 rounded" />
      </div>

      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div className="h-4 w-32 bg-slate-200 rounded" />
          <div className="h-3 w-full bg-slate-100 rounded" />
          <div className="h-3 w-2/3 bg-slate-100 rounded" />
          <div className="h-9 w-40 bg-slate-100 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
