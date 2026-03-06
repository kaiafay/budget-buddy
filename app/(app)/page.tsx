import { CalendarView } from "@/components/calendar-view";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const year = params.year ? parseInt(params.year, 10) : now.getFullYear();
  const month = params.month
    ? Math.min(12, Math.max(1, parseInt(params.month, 10)))
    : now.getMonth() + 1;
  return <CalendarView initialMonth={month} initialYear={year} />;
}
