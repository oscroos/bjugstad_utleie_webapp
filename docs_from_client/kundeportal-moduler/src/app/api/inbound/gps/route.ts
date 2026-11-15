import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluerPosisjon } from "@/lib/kart/soner";

// ────────────────────────────────────────────────────────────────────────────
//  INBOUND GPS – Teltonika (FMB/FMC) og Mictrack (MT-serien)
//  Disse enhetene PUSHER data (TCP, Codec 8E / MT-protokoll). En liten
//  parser-tjeneste (eller mellomvare som flespi) oversetter til JSON og
//  poster hit. Sikres med delt hemmelighet per enhetsflåte.
//
//  Body: { deviceImei, records: [{ lat, lng, speedKmh, ignition, at,
//          fuelLiters?, engineHours? }] }
//  IMEI → maskin via MachineTelemetryLink (provider TELTONIKA/MICTRACK,
//  externalId = IMEI). Tomgang: ignition på + fart < 2 km/t.
// ────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  if (req.headers.get("x-ingest-secret") !== process.env.GPS_INGEST_SECRET) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const b = await req.json();
  if (!b.deviceImei || !Array.isArray(b.records)) {
    return NextResponse.json({ error: "deviceImei og records er påkrevd." }, { status: 400 });
  }
  const link = await prisma.machineTelemetryLink.findFirst({
    where: { externalId: b.deviceImei, provider: { in: ["TELTONIKA", "MICTRACK"] }, active: true },
  });
  if (!link) return NextResponse.json({ error: "Ukjent enhet." }, { status: 404 });

  let stored = 0;
  for (const r of b.records) {
    if (r.lat == null || r.lng == null || !r.at) continue;
    const speed = Number(r.speedKmh ?? 0);
    const status = r.ignition ? (speed < 2 ? "IDLE" : "WORKING") : "OFF";
    // Prosjekt: auto-deteksjon via SITE_BOUNDARY-geofence gjøres i evaluerPosisjon-
    // laget / cron; her lagres posisjonen med link-maskinens aktive prosjekt.
    const pos = await prisma.machinePosition.create({
      data: {
        machineId: link.machineId,
        lat: Number(r.lat), lng: Number(r.lng),
        speedKmh: speed, status: status as never,
        at: new Date(r.at), source: "SENSOR",
      },
    });
    if (pos.projectId) {
      await evaluerPosisjon({
        projectId: pos.projectId, machineId: link.machineId,
        lat: pos.lat, lng: pos.lng, speedKmh: speed, status, at: pos.at,
      });
    }
    stored++;
  }
  await prisma.machineTelemetryLink.update({ where: { id: link.id }, data: { lastSyncAt: new Date() } });
  return NextResponse.json({ stored });
}
