function pickMetaString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

export function getUserDisplayNameFromMetadata(
  meta: Record<string, unknown>,
): string {
  const given = pickMetaString(meta, "given_name");
  const family = pickMetaString(meta, "family_name");
  if (given || family) {
    return [given, family].filter(Boolean).join(" ");
  }
  return "";
}

export function getUserGivenNameFromMetadata(
  meta: Record<string, unknown>,
): string {
  return pickMetaString(meta, "given_name");
}

export function getUserDisplayInitials(
  user: {
    user_metadata?: Record<string, unknown>;
  } | null,
): string {
  if (!user) return "··";
  const meta = user.user_metadata ?? {};
  const name =
    getUserDisplayNameFromMetadata(meta) ||
    pickMetaString(meta, "name") ||
    pickMetaString(meta, "display_name") ||
    pickMetaString(meta, "preferred_username");
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0]![0];
      const b = parts[parts.length - 1]![0];
      if (a && b) return (a + b).toUpperCase();
    }
    if (name.length >= 2) return name.slice(0, 2).toUpperCase();
    const first = name[0];
    return first ? first.toUpperCase() + "·" : "··";
  }
  return "··";
}
