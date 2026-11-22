import type { CompanyRole, ProjectRole, Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import type { AuditChange } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type AuthenticatedSession = Session & { user: Session["user"] & { id: string } };

const CUSTOMER_ROLE_LEVEL: Record<CompanyRole, number> = {
  user: 1,
  admin: 2,
};

const PROJECT_ROLE_LEVEL: Record<ProjectRole, number> = {
  VIEWER: 1,
  MEMBER: 2,
  PROJECT_MANAGER: 3,
  OWNER: 4,
};

function hasAuthenticatedUser(session: Session | null): session is AuthenticatedSession {
  return typeof session?.user?.id === "string" && session.user.id.length > 0;
}

export async function requireAuthenticatedUser() {
  const session = await auth();
  return hasAuthenticatedUser(session) ? session : null;
}

export async function requireSuperAdmin() {
  const session = await requireAuthenticatedUser();
  if (!session || session.user.role !== "super_admin") return null;
  return session;
}

export async function requireCustomerAccess(
  customerId: number,
  minRole: CompanyRole = "user",
) {
  const session = await requireAuthenticatedUser();
  if (!session) return null;

  if (session.user.role === "super_admin") {
    return { session, customerId, role: "admin" as CompanyRole, isSuperAdmin: true };
  }

  const access = await prisma.userCustomerAccess.findUnique({
    where: {
      userId_customerId: {
        userId: session.user.id,
        customerId,
      },
    },
    select: { role: true },
  });

  if (!access) return null;
  if (CUSTOMER_ROLE_LEVEL[access.role] < CUSTOMER_ROLE_LEVEL[minRole]) return null;

  return { session, customerId, role: access.role, isSuperAdmin: false };
}

export async function requireProjectRole(
  projectId: string,
  minRole: ProjectRole = "VIEWER",
) {
  const session = await requireAuthenticatedUser();
  if (!session) return null;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      customerId: true,
      projectNumber: true,
      name: true,
      participants: {
        where: { userId: session.user.id },
        select: { role: true },
      },
    },
  });

  if (!project) return null;

  if (session.user.role === "super_admin") {
    return { session, project, role: "OWNER" as ProjectRole, isSuperAdmin: true };
  }

  const customerAccess = await prisma.userCustomerAccess.findUnique({
    where: {
      userId_customerId: {
        userId: session.user.id,
        customerId: project.customerId,
      },
    },
    select: { role: true },
  });

  if (!customerAccess) return null;

  if (customerAccess.role === "admin") {
    return { session, project, role: "OWNER" as ProjectRole, isSuperAdmin: false };
  }

  const projectRole = project.participants[0]?.role ?? null;
  if (!projectRole) return null;
  if (PROJECT_ROLE_LEVEL[projectRole] < PROJECT_ROLE_LEVEL[minRole]) return null;

  return { session, project, role: projectRole, isSuperAdmin: false };
}

/**
 * Writes one entry to the activity log (shown to super admins under Aktivitet).
 * Pass `project` for anything that happens inside a project, and `changes` with
 * the old and new values when something was edited.
 */
export async function writeAuditLog(params: {
  customerId?: number | null;
  userId?: string | null;
  project?: { id: string; projectNumber?: string | null; name?: string | null } | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  changes?: AuditChange[];
  metadata?: Record<string, Prisma.InputJsonValue>;
}) {
  try {
    const projectLabel = params.project
      ? [params.project.projectNumber, params.project.name].filter(Boolean).join(" ")
      : "";
    const metadata: Record<string, Prisma.InputJsonValue> = {
      ...params.metadata,
      ...(projectLabel ? { projectLabel } : {}),
      ...(params.changes?.length ? { changes: params.changes } : {}),
    };

    await prisma.auditLog.create({
      data: {
        customerId: params.customerId ?? null,
        userId: params.userId ?? null,
        projectId: params.project?.id ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log", error);
  }
}
