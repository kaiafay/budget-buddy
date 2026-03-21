import { CalendarView } from "@/components/calendar-view";

function parseCalendarQueryMonthYear(
  monthStr: string | undefined,
  yearStr: string | undefined,
  now: Date,
): { month: number; year: number } {
  const parsedMonth = monthStr ? Number.parseInt(monthStr, 10) : NaN;
  const parsedYear = yearStr ? Number.parseInt(yearStr, 10) : NaN;

  const month =
    Number.isFinite(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
      ? parsedMonth
      : now.getMonth() + 1;

  const currentYear = now.getFullYear();
  const year =
    Number.isFinite(parsedYear) && parsedYear >= 1900 && parsedYear <= 2100
      ? parsedYear
      : currentYear;

  return { month, year };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const { month, year } = parseCalendarQueryMonthYear(
    params.month,
    params.year,
    now,
  );
  return <CalendarView initialMonth={month} initialYear={year} />;
}
