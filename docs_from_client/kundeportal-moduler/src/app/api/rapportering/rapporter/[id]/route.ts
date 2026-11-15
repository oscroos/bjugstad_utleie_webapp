import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

async function hentEid(id: string, orgId: string) {
  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      requirement: { include: { dataFields: true } },
      project: { select: { id: true, name: true, projectNumber: true, organizationId: true } },
    },
  });
  if (!report || report.project.organizationId !== orgId) return null;
  return report;
}

// GET /api/rapportering/rapporter/:id
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const { id } = await params;
  const report = await hentEid(id, session.user.organizationId);
  if (!report) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  return NextResponse.json({ report });
}

// PATCH /api/rapportering/rapporter/:id
// Lagrer utfylte manuelle felt (content) og/eller status/tekst.
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const { id } = await params;
  const report = await hentEid(id, session.user.organizationId);
  if (!report) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.report.update({
    where: { id },
    data: {
      content: body.content ?? undefined,
      generatedBody: body.generatedBody ?? undefined,
      status: body.status ?? undefined, // DRAFT | READY | SUBMITTED
      submittedAt: body.status === "SUBMITTED" ? new Date() : undefined,
    },
  });
  return NextResponse.json({ report: updated });
}
