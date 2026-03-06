export default function Loading() {
  return (
    <div className="flex flex-col animate-pulse">
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-24 rounded-full bg-white/25" />
          <div className="h-5 w-36 rounded-full bg-white/25" />
        </div>
        <div className="h-10 w-10 rounded-full bg-white/25" />
      </div>
      <div className="flex gap-3 px-5 pb-2 pt-1">
        <div className="h-16 flex-1 rounded-2xl bg-white/25" />
        <div className="h-16 flex-1 rounded-2xl bg-white/25" />
      </div>
      <div className="glass-card mx-4 mt-1 rounded-3xl pt-4 px-5">
        <div className="mx-auto mb-4 h-6 w-32 rounded-full bg-white/25" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-white/25" />
          ))}
        </div>
      </div>
    </div>
  );
}
