import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectAccess } from "@/lib/prosjekter/queries";

// GET /api/rapportering/kontraktdokumenter?projectId=...
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });
  const access = await assertProjectAccess(projectId, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const documents = await prisma.projectContractDocument.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ documents });
}

// POST /api/rapportering/kontraktdokumenter
// Kobler et dokument fra dokumentmodulen (documentId) til prosjektet for analyse.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const body = await req.json();
  const { projectId, documentId, fileName } = body ?? {};
  if (!projectId || !documentId) {
    return NextResponse.json({ error: "projectId og documentId er påkrevd." }, { status: 400 });
  }
  const access = await assertProjectAccess(projectId, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  try {
    const doc = await prisma.projectContractDocument.create({
      data: { projectId, documentId, fileName: fileName ?? null },
    });
    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Dokumentet er allerede dratt inn." }, { status: 409 });
    }
    throw err;
  }
}

// DELETE /api/rapportering/kontraktdokumenter?id=...
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Mangler id." }, { status: 400 });

  const doc = await prisma.projectContractDocument.findUnique({
    where: { id },
    select: { project: { select: { organizationId: true } } },
  });
  if (doc?.project.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  }
  await prisma.projectContractDocument.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
