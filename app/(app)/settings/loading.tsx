export default function Loading() {
  return (
    <div className="flex flex-col animate-pulse px-5 pt-6 gap-5">
      <div className="flex flex-col gap-2">
        <div className="h-5 w-24 rounded-full bg-muted" />
        <div className="h-3 w-40 rounded-full bg-muted" />
      </div>
      <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-muted" />
          <div className="h-4 w-28 rounded-full bg-muted" />
        </div>
        <div className="h-11 rounded-xl bg-muted" />
      </div>
      <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-muted" />
          <div className="h-4 w-28 rounded-full bg-muted" />
        </div>
        <div className="h-11 rounded-xl bg-muted" />
      </div>
      <div className="h-11 rounded-xl bg-muted" />
    </div>
  );
}
