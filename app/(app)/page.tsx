import { CalendarView } from "@/components/calendar-view";
import { createClient } from "@/lib/supabase/server";
import {
  getUserDisplayInitials,
  getUserGivenNameFromMetadata,
} from "@/lib/user-display";

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

function parseSelectedDate(
  selectedStr: string | undefined,
): string | undefined {
  if (!selectedStr || selectedStr.length < 10) return undefined;
  const ymd = selectedStr.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return undefined;
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d))
    return undefined;
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return undefined;
  }
  return ymd;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; selected?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const { month, year } = parseCalendarQueryMonthYear(
    params.month,
    params.year,
    now,
  );
  const initialSelectedDate = parseSelectedDate(params.selected);

  // getUser is called server-side only to derive display props (givenName, avatarInitials)
  // for the calendar header. All app data is fetched client-side via SWR.
  // After a profile name change the user needs to router.refresh() or revisit / for updated props.
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  const givenName = getUserGivenNameFromMetadata(user?.user_metadata ?? {});
  const avatarInitials = getUserDisplayInitials(user);

  return (
    <CalendarView
      initialMonth={month}
      initialYear={year}
      initialSelectedDate={initialSelectedDate}
      givenName={givenName}
      avatarInitials={avatarInitials}
    />
  );
}
