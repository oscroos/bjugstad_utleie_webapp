import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectRole, audit } from "@/lib/sikkerhet/guard";

// Datadeling UE → entreprenør → byggherre, kun med eierens samtykke.
// GET: grants gitt AV og TIL min org. POST: gi samtykke. DELETE: trekk tilbake.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get("projectId") ?? undefined;
  const grants = await prisma.dataShareGrant.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      OR: [{ ownerOrgId: session.user.organizationId }, { recipientOrgId: session.user.organizationId }],
    },
    orderBy: { grantedAt: "desc" },
  });
  return NextResponse.json({ grants });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  const { projectId, recipientOrgId, scopes } = b ?? {};
  if (!projectId || !recipientOrgId || !Array.isArray(scopes) || scopes.length === 0) {
    return NextResponse.json({ error: "projectId, recipientOrgId og scopes er påkrevd." }, { status: 400 });
  }
  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "PROJECT_MANAGER");
  if (!access) return NextResponse.json({ error: "Krever prosjektleder." }, { status: 403 });

  const grant = await prisma.dataShareGrant.upsert({
    where: { projectId_ownerOrgId_recipientOrgId: { projectId, ownerOrgId: session.user.organizationId, recipientOrgId } },
    update: { scopes, active: true, revokedAt: null },
    create: { projectId, ownerOrgId: session.user.organizationId, recipientOrgId, scopes, grantedById: session.user.id },
  });
  await audit({ organizationId: session.user.organizationId, userId: session.user.id, action: "share.grant", entityType: "DataShareGrant", entityId: grant.id, metadata: { recipientOrgId, scopes } });
  return NextResponse.json({ grant }, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const { id } = (await req.json()) ?? {};
  if (!id) return NextResponse.json({ error: "Mangler id." }, { status: 400 });
  const grant = await prisma.dataShareGrant.findUnique({ where: { id } });
  if (!grant || grant.ownerOrgId !== session.user.organizationId) {
    return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  }
  await prisma.dataShareGrant.update({ where: { id }, data: { active: false, revokedAt: new Date() } });
  await audit({ organizationId: session.user.organizationId, userId: session.user.id, action: "share.revoke", entityType: "DataShareGrant", entityId: id });
  return NextResponse.json({ ok: true });
}
