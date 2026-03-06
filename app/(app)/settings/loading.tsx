export default function Loading() {
  return (
    <div className="flex flex-col gap-5 px-5 pt-6 animate-pulse">
      <div className="flex flex-col gap-2">
        <div className="h-5 w-24 rounded-full bg-white/25" />
        <div className="h-3 w-40 rounded-full bg-white/25" />
      </div>
      <div className="glass-card flex flex-col gap-4 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white/25" />
          <div className="h-4 w-28 rounded-full bg-white/25" />
        </div>
        <div className="h-11 rounded-xl bg-white/25" />
      </div>
      <div className="glass-card flex flex-col gap-4 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white/25" />
          <div className="h-4 w-28 rounded-full bg-white/25" />
        </div>
        <div className="h-11 rounded-xl bg-white/25" />
      </div>
      <div className="h-11 rounded-xl bg-white/25" />
    </div>
  );
}
