import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectAccess } from "@/lib/prosjekter/queries";

// GET  /api/rapportering/ns-standarder?projectId=...
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });
  const access = await assertProjectAccess(projectId, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const standards = await prisma.projectNsStandard.findMany({
    where: { projectId },
    orderBy: { standardNo: "asc" },
  });
  return NextResponse.json({ standards });
}

// POST /api/rapportering/ns-standarder
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const body = await req.json();
  const { projectId, standardNo } = body ?? {};
  if (!projectId || !standardNo?.trim()) {
    return NextResponse.json({ error: "projectId og NS-nummer er påkrevd." }, { status: 400 });
  }
  const access = await assertProjectAccess(projectId, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const standard = await prisma.projectNsStandard.create({
    data: {
      projectId,
      standardNo: standardNo.trim(),
      title: body.title ?? null,
      clause: body.clause ?? null,
      notes: body.notes ?? null,
    },
  });
  return NextResponse.json({ standard }, { status: 201 });
}

// DELETE /api/rapportering/ns-standarder?id=...
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Mangler id." }, { status: 400 });

  const std = await prisma.projectNsStandard.findUnique({
    where: { id },
    select: { project: { select: { organizationId: true } } },
  });
  if (std?.project.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  }

  await prisma.projectNsStandard.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
