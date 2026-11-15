import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectAccess } from "@/lib/prosjekter/queries";

// GET /api/minijuristen/threads?projectId=...
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });
  const access = await assertProjectAccess(projectId, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const threads = await prisma.minijuristThread.findMany({
    where: { projectId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ threads });
}

// POST /api/minijuristen/threads  → ny tråd
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const body = await req.json();
  const { projectId, title } = body ?? {};
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });
  const access = await assertProjectAccess(projectId, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const thread = await prisma.minijuristThread.create({
    data: {
      projectId,
      title: title?.trim() || "Ny samtale",
      createdById: session.user.id,
      shareToKnowledgeBase: Boolean(body.shareToKnowledgeBase),
    },
    include: { messages: true },
  });
  return NextResponse.json({ thread }, { status: 201 });
}
