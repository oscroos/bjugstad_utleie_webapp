import { prisma } from "@/lib/prisma";

// Geofence-motor: fart i sone, forbudssone, utenfor arbeidstid, forlatt anlegg
// (tyverisikring – Trackunit Theft Defense-paritet).
type Pt = [number, number];

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > p[1]) !== (yj > p[1])) && (p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function innenforArbeidstid(naa: Date, from?: string | null, to?: string | null) {
  if (!from || !to) return true;
  const t = naa.getHours() * 60 + naa.getMinutes();
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  return t >= fh * 60 + fm && t <= th * 60 + tm;
}

/** Kjøres ved hver posisjonsoppdatering (fra telemetri-synk eller app). */
export async function evaluerPosisjon(params: {
  projectId: string; machineId: string; lat: number; lng: number;
  speedKmh: number | null; status: string; at: Date;
}) {
  const zones = await prisma.siteZone.findMany({ where: { projectId: params.projectId } });
  const p: Pt = [params.lat, params.lng];
  const opprett = (type: string, zoneId: string | null, details: string) =>
    prisma.zoneEvent.create({
      data: { projectId: params.projectId, zoneId, machineId: params.machineId, type: type as never, details },
    });

  for (const z of zones) {
    const poly = z.polygon as unknown as Pt[];
    const inne = pointInPolygon(p, poly);
    if (z.type === "SPEED" && inne && z.maxSpeedKmh && (params.speedKmh ?? 0) > z.maxSpeedKmh) {
      await opprett("SPEEDING", z.id, `${Math.round(params.speedKmh!)} km/t i ${z.name} (maks ${z.maxSpeedKmh})`);
    }
    if (z.type === "NO_GO" && inne) {
      await opprett("ENTERED_NO_GO", z.id, `Maskin i forbudssone ${z.name}`);
    }
    if (z.type === "SITE_BOUNDARY") {
      if (!inne && params.status !== "OFF") {
        await opprett("LEFT_SITE", z.id, "Maskin i drift utenfor anleggsgrensen – mulig tyveri");
      }
      if (inne && params.status !== "OFF" && !innenforArbeidstid(params.at, z.workHoursFrom, z.workHoursTo)) {
        await opprett("OUT_OF_HOURS", z.id, "Maskin i drift utenfor arbeidstid");
      }
    }
  }
}
