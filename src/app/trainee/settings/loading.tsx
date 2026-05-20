export default function SettingsLoading() {
  return (
    <div className="p-4 md:p-8 max-w-lg animate-pulse">
      <div className="h-7 w-24 bg-slate-200 rounded-lg mb-6" />
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div className="h-4 w-36 bg-slate-200 rounded" />
        <div className="space-y-3">
          <div className="h-3 w-28 bg-slate-100 rounded" />
          <div className="h-10 w-full bg-slate-100 rounded-lg" />
        </div>
        <div className="space-y-3">
          <div className="h-3 w-28 bg-slate-100 rounded" />
          <div className="h-10 w-full bg-slate-100 rounded-lg" />
        </div>
        <div className="space-y-3">
          <div className="h-3 w-28 bg-slate-100 rounded" />
          <div className="h-10 w-full bg-slate-100 rounded-lg" />
        </div>
        <div className="h-10 w-36 bg-slate-200 rounded-lg" />
      </div>
    </div>
  );
}
