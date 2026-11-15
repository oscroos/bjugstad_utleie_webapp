import type { ReportInterval } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────────
//  FORFALLSBEREGNING
//  Ren funksjon: gitt et intervall og et startpunkt, regn ut forfallsdatoer.
//  Brukes både til å vise «neste forfall» og til å materialisere rapportutkast.
// ────────────────────────────────────────────────────────────────────────────

const MND_STEG: Partial<Record<ReportInterval, number>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
  ANNUAL: 12,
};
const DAG_STEG: Partial<Record<ReportInterval, number>> = {
  DAILY: 1,
  WEEKLY: 7,
  BIWEEKLY: 14,
};

/** Neste forfall etter en gitt dato (eksklusiv). Null for engangs/hendelsesstyrt. */
export function nesteForfall(
  interval: ReportInterval,
  anchor: Date,
  etter: Date = new Date()
): Date | null {
  if (interval === "ONE_TIME") return anchor > etter ? anchor : null;
  if (interval === "EVENT_BASED" || interval === "CUSTOM") return null;

  const d = new Date(anchor);
  const guard = 5000; // sikkerhetsstopp
  let i = 0;
  while (d <= etter && i < guard) {
    stegFrem(d, interval);
    i++;
  }
  return d;
}

/** Alle forfall i et vindu [fra, til]. Nyttig til materialisering og varsler. */
export function forfallIVindu(
  interval: ReportInterval,
  anchor: Date,
  fra: Date,
  til: Date
): Date[] {
  if (interval === "EVENT_BASED" || interval === "CUSTOM") return [];
  if (interval === "ONE_TIME") return anchor >= fra && anchor <= til ? [anchor] : [];

  const ut: Date[] = [];
  const d = new Date(anchor);
  const guard = 5000;
  let i = 0;
  while (d < fra && i < guard) {
    stegFrem(d, interval);
    i++;
  }
  while (d <= til && i < guard) {
    ut.push(new Date(d));
    stegFrem(d, interval);
    i++;
  }
  return ut;
}

function stegFrem(d: Date, interval: ReportInterval) {
  if (MND_STEG[interval]) {
    d.setMonth(d.getMonth() + (MND_STEG[interval] as number));
  } else if (DAG_STEG[interval]) {
    d.setDate(d.getDate() + (DAG_STEG[interval] as number));
  }
}

export type ForfallStatus = "OVERDUE" | "DUE_SOON" | "UPCOMING";

/** Klassifiser et forfall relativt til i dag (DUE_SOON = innen 7 dager). */
export function klassifiser(due: Date, naa: Date = new Date()): ForfallStatus {
  const dager = (due.getTime() - naa.getTime()) / 86_400_000;
  if (dager < 0) return "OVERDUE";
  if (dager <= 7) return "DUE_SOON";
  return "UPCOMING";
}
