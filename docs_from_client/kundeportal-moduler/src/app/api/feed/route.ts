import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/sikkerhet/guard";

// Live feed fra anlegget (Ditio-paritet): bilder, status, beskjeder.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });
  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "VIEWER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  const posts = await prisma.siteFeedPost.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ posts });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  if (!b.projectId || !b.text?.trim()) return NextResponse.json({ error: "projectId og tekst er påkrevd." }, { status: 400 });
  const access = await requireProjectRole(b.projectId, session.user.id, session.user.organizationId, "MEMBER");
  if (!access) return NextResponse.json({ error: "Ikke funnet eller manglende rolle." }, { status: 404 });
  const post = await prisma.siteFeedPost.create({
    data: { projectId: b.projectId, userId: session.user.id, text: b.text.trim(), photoDocIds: b.photoDocIds ?? [] },
  });
  return NextResponse.json({ post }, { status: 201 });
}
