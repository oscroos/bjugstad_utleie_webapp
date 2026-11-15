import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// AEMP 2.0 / ISO 15143-3-stil eksport (MachineMax-paritet): standardformat
// slik at kundene kan konsumere flåtedata i egne systemer. Forenklet payload
// med samme feltnavn-konvensjoner som standarden.
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });

  const snaps: { machineId: string; _sum: { engineHours: number | null; idleHours: number | null; fuelLiters: number | null } }[] =
    await prisma.telemetrySnapshot.groupBy({
      by: ["machineId"],
      _sum: { engineHours: true, idleHours: true, fuelLiters: true },
    }) as never;

  const positions: { machineId: string; lat: number; lng: number; at: Date }[] = await prisma.$queryRaw`
    SELECT DISTINCT ON ("machineId") "machineId", lat, lng, at
    FROM "MachinePosition" ORDER BY "machineId", "at" DESC`;
  const posMap = new Map(positions.map((p) => [p.machineId, p]));

  return NextResponse.json({
    version: "AEMP 2.0 (forenklet)",
    fleet: snaps.map((s) => ({
      equipmentHeader: { equipmentId: s.machineId },
      location: posMap.get(s.machineId)
        ? { latitude: posMap.get(s.machineId)!.lat, longitude: posMap.get(s.machineId)!.lng, datetime: posMap.get(s.machineId)!.at }
        : null,
      cumulativeOperatingHours: { hour: s._sum.engineHours ?? 0 },
      cumulativeIdleHours: { hour: s._sum.idleHours ?? 0 },
      fuelUsed: { fuelConsumed: s._sum.fuelLiters ?? 0, unit: "litre" },
    })),
  });
}
