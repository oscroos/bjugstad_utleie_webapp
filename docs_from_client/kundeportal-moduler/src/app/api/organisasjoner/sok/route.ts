import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/organisasjoner/sok?q=...
// Søker opp andre selskaper registrert i portalen (for å legge til som UE).
// Ekskluderer egen organisasjon.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results = await prisma.organization.findMany({
    where: {
      id: { not: session.user.organizationId },
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { orgNumber: { contains: q } },
      ],
    },
    select: { id: true, name: true, orgNumber: true, city: true },
    take: 10,
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ results });
}
