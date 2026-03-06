export default function Loading() {
  return (
    <div className="flex flex-col gap-6 px-5 pt-6 animate-pulse">
      <div className="flex flex-col gap-2">
        <div className="h-5 w-32 rounded-full bg-white/25" />
        <div className="h-3 w-48 rounded-full bg-white/25" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="h-3 w-24 rounded-full bg-white/25" />
          <div className="glass-card flex flex-col gap-1 rounded-2xl p-2">
            {Array.from({ length: 2 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3 px-3 py-2.5">
                <div className="h-9 w-9 rounded-xl bg-white/25" />
                <div className="h-4 flex-1 rounded-full bg-white/25" />
                <div className="h-4 w-16 rounded-full bg-white/25" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
