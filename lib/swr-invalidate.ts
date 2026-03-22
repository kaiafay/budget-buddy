import { mutate } from "swr";
import { calendarMonthSwrKey } from "@/lib/swr-keys";

export function invalidateNext12CalendarMonths() {
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    mutate(calendarMonthSwrKey(d.getMonth() + 1, d.getFullYear()));
  }
  mutate("transactions");
}
