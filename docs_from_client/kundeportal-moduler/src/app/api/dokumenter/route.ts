import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { seedDokumenthotell, opprettProsjektmappe, opprettUndermappe, hentProsjektMapper } from "@/lib/dokumenter/hotell";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const orgId = session.user.organizationId;
  await seedDokumenthotell(orgId);
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (projectId) return NextResponse.json({ folders: await hentProsjektMapper(orgId, projectId) });
  const tree = await prisma.docFolder.findMany({
    where: { organizationId: orgId, parentId: null },
    include: { files: true, children: { include: { files: true, children: { include: { files: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ tree });
}

// POST { type:"projectFolder", projectId } | { type:"subFolder", parentId, name }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  if (b.type === "projectFolder") {
    const folder = await opprettProsjektmappe(session.user.organizationId, b.projectId, session.user.id);
    return NextResponse.json({ folder }, { status: 201 });
  }
  if (b.type === "subFolder") {
    if (!b.name?.trim()) return NextResponse.json({ error: "Mappenavn er påkrevd." }, { status: 400 });
    const folder = await opprettUndermappe(session.user.organizationId, b.parentId, b.name, session.user.id);
    return NextResponse.json({ folder }, { status: 201 });
  }
  return NextResponse.json({ error: "Ukjent type." }, { status: 400 });
}
