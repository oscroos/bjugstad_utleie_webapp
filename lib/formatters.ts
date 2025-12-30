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
