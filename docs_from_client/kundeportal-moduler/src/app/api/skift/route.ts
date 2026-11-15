import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/sikkerhet/guard";

// Skiftplanlegging (Ditio Core-paritet)
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const projectId = p.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });
  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "VIEWER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  const from = p.get("from") ? new Date(p.get("from")!) : new Date();
  const to = p.get("to") ? new Date(p.get("to")!) : new Date(Date.now() + 7 * 86_400_000);
  const shifts = await prisma.shift.findMany({ where: { projectId, date: { gte: from, lte: to } }, orderBy: { date: "asc" } });
  return NextResponse.json({ shifts });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  if (!b.projectId || !b.userId || !b.date || !b.fromTime || !b.toTime) {
    return NextResponse.json({ error: "projectId, userId, dato og tid er påkrevd." }, { status: 400 });
  }
  const access = await requireProjectRole(b.projectId, session.user.id, session.user.organizationId, "PROJECT_MANAGER");
  if (!access) return NextResponse.json({ error: "Krever prosjektleder." }, { status: 403 });
  const shift = await prisma.shift.create({
    data: { projectId: b.projectId, userId: b.userId, date: new Date(b.date), fromTime: b.fromTime, toTime: b.toTime, role: b.role ?? null },
  });
  return NextResponse.json({ shift }, { status: 201 });
}
