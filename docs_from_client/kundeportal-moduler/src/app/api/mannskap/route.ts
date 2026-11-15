import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/sikkerhet/guard";
import { timeoversikt } from "@/lib/tid/timer";

// GET /api/mannskap?projectId=...&from=...&to=... → innsjekkede + timeoversikt
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const projectId = p.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });
  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "VIEWER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const from = p.get("from") ? new Date(p.get("from")!) : new Date(Date.now() - 7 * 86_400_000);
  const to = p.get("to") ? new Date(p.get("to")!) : new Date();
  const [innsjekket, timer] = await Promise.all([
    prisma.crewCheckin.findMany({ where: { projectId, checkoutAt: null } }),
    timeoversikt(projectId, from, to),
  ]);
  return NextResponse.json({ innsjekket, timer });
}

// POST /api/mannskap  { projectId, action: "checkin"|"checkout", lat?, lng?, source? }
// Kalles fra felt-appen (GPS) eller QR ved port. Mater mannskapslisten
// (byggherreforskriften) og den automatiske timeføringen.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  if (!b.projectId || !["checkin", "checkout"].includes(b.action)) {
    return NextResponse.json({ error: "projectId og action (checkin/checkout) er påkrevd." }, { status: 400 });
  }
  const access = await requireProjectRole(b.projectId, session.user.id, session.user.organizationId, "MEMBER");
  if (!access) return NextResponse.json({ error: "Ikke funnet eller manglende rolle." }, { status: 404 });

  if (b.action === "checkin") {
    const c = await prisma.crewCheckin.create({
      data: { projectId: b.projectId, userId: session.user.id, checkinAt: new Date(), lat: b.lat ?? null, lng: b.lng ?? null, source: b.source ?? "APP" },
    });
    return NextResponse.json({ checkin: c }, { status: 201 });
  }
  const open = await prisma.crewCheckin.findFirst({
    where: { projectId: b.projectId, userId: session.user.id, checkoutAt: null },
    orderBy: { checkinAt: "desc" },
  });
  if (!open) return NextResponse.json({ error: "Ingen åpen innsjekk." }, { status: 400 });
  const c = await prisma.crewCheckin.update({ where: { id: open.id }, data: { checkoutAt: new Date() } });
  return NextResponse.json({ checkout: c });
}
