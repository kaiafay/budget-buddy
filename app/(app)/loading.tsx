export default function Loading() {
  return (
    <div className="flex flex-col animate-pulse">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-24 rounded-full bg-muted" />
          <div className="h-5 w-36 rounded-full bg-muted" />
        </div>
        <div className="h-10 w-10 rounded-full bg-muted" />
      </div>
      <div className="flex gap-3 px-5 pb-2 pt-1">
        <div className="flex-1 h-16 rounded-2xl bg-muted" />
        <div className="flex-1 h-16 rounded-2xl bg-muted" />
      </div>
      <div className="mt-1 rounded-t-3xl bg-card pt-4 px-5 shadow-sm">
        <div className="h-6 w-32 rounded-full bg-muted mx-auto mb-4" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
