export function formatPhone(raw?: string | null, fallback = "-") {
  if (!raw || !raw.trim()) return fallback;
  const compact = raw.replace(/\s+/g, "");
  if (!compact.startsWith("+") || compact.length <= 3) {
    return raw.trim() || fallback;
  }
  const country = compact.slice(0, 3);
  const rest = compact.slice(3);
  const groups = rest.match(/.{1,2}/g);
  const spaced = groups ? groups.join(" ") : rest;
  return `${country} ${spaced}`.trim();
}

export function formatDisplay(value?: string | null, fallback = "-") {
  if (!value) return fallback;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : fallback;
}

export function formatDate(
  value?: string | Date | null,
  options?: { multiline?: boolean },
): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const separator = options?.multiline ? "\n" : " ";
  return `${day}.${month}.${year}${separator}kl. ${hours}:${minutes}`;
}
