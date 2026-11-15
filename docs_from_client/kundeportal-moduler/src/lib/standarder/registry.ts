// ────────────────────────────────────────────────────────────────────────────
//  STANDARDREGISTER – versjonslogikk
//  Kjernen i «vi har versjon X, men siste publiserte er versjon Y».
// ────────────────────────────────────────────────────────────────────────────

/** Trekk ut et sammenlignbart tall (år eller år-måned) fra en versjonsstreng. */
export function versjonsVerdi(v: string | null | undefined): number {
  if (!v) return -1;
  const m = v.match(/(\d{4})(?:[-/.](\d{1,2}))?/); // "2022", "2022-06"
  if (m) {
    const aar = parseInt(m[1], 10);
    const mnd = m[2] ? parseInt(m[2], 10) : 0;
    return aar * 100 + mnd;
  }
  const n = v.match(/\d+/); // "utgave 3" → 3
  return n ? parseInt(n[0], 10) : 0;
}

/** true hvis `siste` er nyere enn `vihar`. */
export function erNyere(siste: string | null | undefined, vihar: string | null | undefined): boolean {
  return versjonsVerdi(siste) > versjonsVerdi(vihar);
}

export interface VersjonsStatus {
  code: string;
  title: string;
  heldVersion: string | null;   // nyeste versjon vi HAR
  latestVersion: string | null; // nyeste PUBLISERTE (kjent)
  outdated: boolean;
  message: string | null;       // ferdig varseltekst til bruker/AI
}

/**
 * Sammenligner nyeste versjon vi har mot nyeste kjente publiserte.
 * `heldVersions` = alle versjoner biblioteket har for standarden.
 */
export function vurderVersjon(
  code: string,
  title: string,
  heldVersions: string[],
  latestKnownVersion: string | null
): VersjonsStatus {
  const held = heldVersions
    .slice()
    .sort((a, b) => versjonsVerdi(b) - versjonsVerdi(a))[0] ?? null;

  const outdated = erNyere(latestKnownVersion, held);
  const message = outdated
    ? `${code}: Vi har tilgjengelig versjon ${held ?? "(ingen)"}, mens siste publiserte er versjon ${latestKnownVersion}. Vurder å oppdatere.`
    : null;

  return { code, title, heldVersion: held, latestVersion: latestKnownVersion, outdated, message };
}

/**
 * INTEGRASJONSPUNKT: oppslag mot offisiell kilde for å oppdatere
 * latestKnownVersion automatisk. I produksjon kan dette bruke web-søk mot
 * Standard Norge / Lovdata. Default: returner lagret verdi uendret.
 */
export async function slaaOppNyesteVersjon(
  code: string,
  lagretLatest: string | null,
  officialUrl?: string | null
): Promise<string | null> {
  // TODO: hent nyeste publiserte versjon fra officialUrl (web_fetch/scrape/API).
  void code;
  void officialUrl;
  return lagretLatest;
}
