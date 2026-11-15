import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { beregnCo2, type OwnershipScope } from "@/lib/miljo/co2";

// GET /api/miljo/regnskap
//   ?scope=OWNED|RENTED|SUBCONTRACTOR|OWNED_RENTED|ALL   (påkrevd)
//   &projectId=...        (valgfri – ett prosjekt)
//   &city=Oslo            (valgfri – sted; alle prosjekter i byen)
//   &from=2026-01-01&to=2026-03-31
//
// Uten projectId/city: hele organisasjonen.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }

  const p = new URL(req.url).searchParams;
  const scope = (p.get("scope") ?? "ALL") as OwnershipScope;
  const gyldige = ["OWNED", "RENTED", "SUBCONTRACTOR", "OWNED_RENTED", "ALL"];
  if (!gyldige.includes(scope)) {
    return NextResponse.json({ error: "Ugyldig scope." }, { status: 400 });
  }

  const result = await beregnCo2({
    organizationId: session.user.organizationId,
    projectId: p.get("projectId") ?? undefined,
    city: p.get("city") ?? undefined,
    scope,
    from: p.get("from") ? new Date(p.get("from") as string) : undefined,
    to: p.get("to") ? new Date(p.get("to") as string) : undefined,
  });

  return NextResponse.json(result);
}
