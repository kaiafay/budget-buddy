/**
 * Appends account=<uuid> so deep links restore the intended budget when
 * localStorage is empty (new device, private mode). Path may already have a query string.
 */
export function withActiveAccountQuery(
  path: string,
  accountId: string | null | undefined,
): string {
  if (!accountId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}account=${encodeURIComponent(accountId)}`;
}
