export default function Loading() {
  return (
    <div className="flex flex-col animate-pulse px-5 pt-6 gap-5">
      <div className="h-5 w-36 rounded-full bg-muted" />
      <div className="h-11 rounded-2xl bg-muted" />
      <div className="h-12 rounded-xl bg-muted" />
      <div className="h-11 rounded-xl bg-muted" />
      <div className="h-11 rounded-xl bg-muted" />
      <div className="h-24 rounded-2xl bg-muted" />
      <div className="h-12 rounded-xl bg-muted" />
    </div>
  );
}
