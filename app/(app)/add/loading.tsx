export default function Loading() {
  return (
    <div className="flex flex-col gap-5 px-5 pt-6 animate-pulse">
      <div className="h-5 w-36 rounded-full bg-white/25" />
      <div className="glass-card rounded-2xl p-4">
        <div className="flex flex-col gap-3">
          <div className="h-11 rounded-2xl bg-white/25" />
          <div className="h-12 rounded-xl bg-white/25" />
          <div className="h-11 rounded-xl bg-white/25" />
          <div className="h-11 rounded-xl bg-white/25" />
          <div className="h-24 rounded-2xl bg-white/25" />
          <div className="h-12 rounded-xl bg-white/25" />
        </div>
      </div>
    </div>
  );
}
