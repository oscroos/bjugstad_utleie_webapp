import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/app/config
// Appen kaller denne ved oppstart / med jevne mellomrom (og cacher lokalt for
// offline-bruk). Gir alt appen trenger for registrering:
//  • brukerens prosjekter (til GPS-forslag og QR)
//  • referansedata (massetyper, klassifiseringer, drivstofftyper, RUH-typer)
//  • qrPayload per prosjekt: appen genererer/leser QR med dette innholdet,
//    slik at sjåfør/arbeider scanner i stedet for å taste.
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: {
      organizationId: session.user.organizationId,
      status: { in: ["PLANNING", "ACTIVE"] },
      participants: { some: { userId: session.user.id } },
    },
    select: { id: true, projectNumber: true, name: true, city: true, addressLine: true },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    projects: projects.map((p) => ({
      ...p,
      qrPayload: `portal://project/${p.id}`,
    })),
    reference: {
      classifications: [
        { value: "CLEAN", label: "Rene masser" },
        { value: "CONTAMINATED", label: "Forurenset", requiresDeclaration: true },
        { value: "HAZARDOUS", label: "Farlig avfall", requiresDeclaration: true },
        { value: "UNKNOWN", label: "Uklassifisert" },
      ],
      fuelTypes: [
        { value: "DIESEL", label: "Diesel", unit: "liter" },
        { value: "HVO", label: "HVO100", unit: "liter" },
        { value: "ELECTRIC", label: "Elektrisk", unit: "kWh" },
        { value: "BIOGAS", label: "Biogass", unit: "kg" },
      ],
      ruhSeverities: [
        { value: "OBSERVATION", label: "Observasjon" },
        { value: "NEAR_MISS", label: "Nestenulykke" },
        { value: "INJURY_NO_LOST_TIME", label: "Personskade uten fravær" },
        { value: "INJURY_LOST_TIME", label: "Personskade med fravær", notifiable: true },
        { value: "ENVIRONMENTAL", label: "Miljøhendelse" },
      ],
      ownerships: [
        { value: "OWNED", label: "Egen maskin" },
        { value: "RENTED", label: "Leid maskin" },
        { value: "SUBCONTRACTOR", label: "UE-maskin" },
      ],
    },
    sync: {
      endpoint: "/api/app/sync",
      maxBatchSize: 200,
      // Appens offline-kø: generer UUID per registrering (syncId), send batch
      // ved nett, fjern kun elementer kvittert som saved/duplicate.
    },
  });
}
