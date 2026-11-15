import { prisma } from "@/lib/prisma";

// ── Ditio Flow-paritet, del 8 ───────────────────────────────────────────────

/** Auto-deteksjon av laste-/tippsteder: klynger av gjentatte stopp i
 *  lastesyklus-mønster foreslås som soner. Kjøres i telemetri-cronen. */
export async function foreslaaSoner(projectId: string) {
  // Stopp-punkter siste 7 dager (fart ~0, status WORKING) grupperes grovt
  const stops: { lat: number; lng: number }[] = await prisma.$queryRaw`
    SELECT lat, lng FROM "MachinePosition"
    WHERE "projectId" = ${projectId}
      AND "at" > NOW() - INTERVAL '7 days'
      AND COALESCE("speedKmh",0) < 2 AND status = 'WORKING'`;

  const clusters: { lat: number; lng: number; n: number }[] = [];
  const R = 0.0005; // ~50 m
  for (const s of stops) {
    const c = clusters.find((x) => Math.abs(x.lat - s.lat) < R && Math.abs(x.lng - s.lng) < R);
    if (c) { c.lat = (c.lat * c.n + s.lat) / (c.n + 1); c.lng = (c.lng * c.n + s.lng) / (c.n + 1); c.n++; }
    else clusters.push({ lat: s.lat, lng: s.lng, n: 1 });
  }
  let created = 0;
  for (const c of clusters.filter((x) => x.n >= 10)) {
    const finnes = await prisma.zoneSuggestion.findFirst({
      where: { projectId, lat: { gte: c.lat - R, lte: c.lat + R }, lng: { gte: c.lng - R, lte: c.lng + R } },
    });
    if (finnes) { await prisma.zoneSuggestion.update({ where: { id: finnes.id }, data: { hitCount: c.n } }); continue; }
    await prisma.zoneSuggestion.create({
      data: { projectId, type: "LOAD", lat: c.lat, lng: c.lng, hitCount: c.n },
    });
    created++;
  }
  return { clusters: clusters.length, created };
}

/** Sjåførassistent: ETA og fartsanbefaling mot målsone (just-in-time for å
 *  unngå kø/tomgang ved uttak/tipp). Konsumeres av felt-appen. */
export function beregnAssist(params: {
  distanceKm: number;
  queueAtTargetMin: number;      // estimert kø ved målet (fra andre maskiners ETA)
  maxSpeedKmh: number;
}) {
  const { distanceKm, queueAtTargetMin, maxSpeedKmh } = params;
  // Ankom når køen er unnagjort: senk farten fremfor å vente på tomgang
  const idealMinutes = Math.max((distanceKm / maxSpeedKmh) * 60, queueAtTargetMin);
  const recommendedKmh = Math.min(maxSpeedKmh, Math.max(10, (distanceKm / (idealMinutes / 60))));
  return {
    etaMinutes: Math.round(idealMinutes),
    recommendedSpeedKmh: Math.round(recommendedKmh),
    reason: queueAtTargetMin > (distanceKm / maxSpeedKmh) * 60
      ? "Kø ved målet – senk farten og spar drivstoff fremfor å vente på tomgang"
      : "Fri bane – hold sonegrensen",
  };
}

/** Hellingsjekk for midlertidige veier: flagger for bratte segmenter. */
export function vurderHelling(gradientPct: number): { warning: boolean; note: string } {
  if (gradientPct > 12) return { warning: true, note: "Over 12 % – høyt drivstofforbruk/slitasje; vurder omlegging" };
  if (gradientPct > 8) return { warning: true, note: "8–12 % – akseptabelt lastet nedover, tungt oppover" };
  return { warning: false, note: "OK" };
}
