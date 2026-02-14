export function isYoutubeUrl(input?: string | null): boolean {
  if (!input) return false;
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    return host === "youtu.be" || host.endsWith("youtube.com");
  } catch {
    return false;
  }
}
