import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Globalt søk (Trackunit-paritet): prosjekter, arbeidsordre, tags, sjekklister.
// Utvid med maskiner/dokumenter fra deres eksisterende modeller.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  const like = { contains: q, mode: "insensitive" as const };

  const [projects, workOrders, tags, checklists] = await Promise.all([
    prisma.project.findMany({ where: { organizationId: session.user.organizationId, OR: [{ name: like }, { projectNumber: like }, { clientName: like }] }, select: { id: true, projectNumber: true, name: true }, take: 5 }),
    prisma.workOrder.findMany({ where: { project: { organizationId: session.user.organizationId }, title: like }, select: { id: true, title: true, projectId: true }, take: 5 }),
    prisma.assetTag.findMany({ where: { name: like }, select: { id: true, name: true, projectId: true }, take: 5 }),
    prisma.checklist.findMany({ where: { project: { organizationId: session.user.organizationId }, title: like }, select: { id: true, title: true, projectId: true }, take: 5 }),
  ]);
  return NextResponse.json({ results: [
    ...projects.map((p) => ({ type: "project", id: p.id, label: p.projectNumber + " " + p.name })),
    ...workOrders.map((w) => ({ type: "workOrder", id: w.id, label: w.title, projectId: w.projectId })),
    ...tags.map((t) => ({ type: "assetTag", id: t.id, label: t.name, projectId: t.projectId })),
    ...checklists.map((c) => ({ type: "checklist", id: c.id, label: c.title, projectId: c.projectId })),
  ]});
}
