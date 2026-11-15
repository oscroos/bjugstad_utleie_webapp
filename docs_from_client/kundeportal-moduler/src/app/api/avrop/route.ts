import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendAvropTilUtleier, signerAvrop } from "@/lib/avrop/avrop";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const list = await prisma.callOff.findMany({
    where: { organizationId: session.user.organizationId },
    include: { lines: true }, orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ list });
}

// POST { frameAgreementRef, lines:[{description,quantity,wantedFrom,wantedTo,projectId}] } → DRAFT
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  if (!Array.isArray(b.lines) || !b.lines.length) return NextResponse.json({ error: "Minst én avropslinje." }, { status: 400 });
  const avrop = await prisma.callOff.create({
    data: {
      organizationId: session.user.organizationId,
      frameAgreementRef: b.frameAgreementRef ?? "Rammeavtale leie",
      createdById: session.user.id,
      lines: { create: b.lines.map((l: Record<string, unknown>) => ({
        description: String(l.description ?? "").trim(), quantity: Number(l.quantity ?? 1),
        wantedFrom: l.wantedFrom ? new Date(String(l.wantedFrom)) : null,
        wantedTo: l.wantedTo ? new Date(String(l.wantedTo)) : null,
        projectId: (l.projectId as string) ?? null,
      })) },
    }, include: { lines: true },
  });
  return NextResponse.json({ avrop }, { status: 201 });
}

// PATCH { id, action: "send" | "sign" | "reject", reason? }
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  const avrop = await prisma.callOff.findFirst({ where: { id: b.id, organizationId: session.user.organizationId } });
  if (!avrop) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  if (b.action === "send") return NextResponse.json({ avrop: await sendAvropTilUtleier(b.id) });
  if (b.action === "sign") return NextResponse.json({ avrop: await signerAvrop(b.id, session.user.id, session.user.name ?? "Kunde") });
  if (b.action === "reject") {
    const updated = await prisma.callOff.update({ where: { id: b.id }, data: { status: "REJECTED", rejectReason: b.reason ?? null } });
    return NextResponse.json({ avrop: updated });
  }
  return NextResponse.json({ error: "Ukjent action." }, { status: 400 });
}
