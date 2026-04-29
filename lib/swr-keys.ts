export function calendarMonthSwrKey(
  month: number,
  year: number,
  accountId: string,
): string {
  return `calendar-month-${month}-${year}-${accountId}`;
}

export function transactionsSwrKey(accountId: string): string {
  return `transactions-${accountId}`;
}

export const accountsSwrKey = "accounts";
