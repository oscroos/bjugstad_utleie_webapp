import type { CompanyRole, GlobalRole, ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Who has access to a project ("Brukertilganger")
//
// Mirrors requireProjectRole in lib/access.ts:
//   - super admins can open every project. They are listed here only when they
//     are the project lead.
//   - company admins can open and manage every project of their company.
//   - other users must belong to the company AND be a participant.
//
// The project lead ("prosjektleder") is the participant with role OWNER. The
// creator of a project starts as lead; the role can be handed to another user
// in the company. A project has at most one lead.
// ---------------------------------------------------------------------------

export type ProjectAccessKind = "LEAD" | "PARTICIPANT" | "COMPANY_ADMIN";

export type ProjectAccessMember = {
  userId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  kind: ProjectAccessKind;
  /** May edit the project setup, zones and documents. */
  canEditProject: boolean;
  /** Has a participant row, so the user can be removed from the project. */
  isParticipant: boolean;
  /** False for a participant who no longer belongs to the company. */
  hasAccess: boolean;
  addedAt: string | null;
};

export type ProjectAccessCandidate = {
  userId: string;
  name: string | null;
  phone: string | null;
};

export type ProjectAccessOverview = {
  members: ProjectAccessMember[];
  hasLead: boolean;
};

type ProjectAccessFailure = { ok: false; status: number; error: string };

/** Names are returned for the activity log, which records who was added, removed or made lead. */
export type ProjectAccessResult =
  | { ok: true; userName: string | null; previousLeadNames?: string[]; removedRole?: ProjectRole }
  | ProjectAccessFailure;

type ProjectRef = { id: string; customerId: number };

type AccessUser = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: GlobalRole;
};

export type ParticipantRow = {
  userId: string;
  role: ProjectRole;
  createdAt: Date;
  user: AccessUser;
};

export type CompanyAccessRow = {
  userId: string;
  role: CompanyRole;
  user: AccessUser;
};

const USER_SELECT = { id: true, name: true, phone: true, email: true, role: true } as const;
const KIND_ORDER: Record<ProjectAccessKind, number> = { LEAD: 0, PARTICIPANT: 1, COMPANY_ADMIN: 2 };
const PARTICIPANT_ROLE: ProjectRole = "MEMBER";
const LEAD_ROLE: ProjectRole = "OWNER";

/** Builds the access list from participant rows and the company's user accesses. */
export function buildProjectAccessMembers(
  participants: ParticipantRow[],
  companyAccesses: CompanyAccessRow[],
): ProjectAccessMember[] {
  const companyRoleByUser = new Map(companyAccesses.map((access) => [access.userId, access.role]));
  const members: ProjectAccessMember[] = [];
  const listed = new Set<string>();

  for (const participant of participants) {
    const isSuperAdmin = participant.user.role === "super_admin";
    // Super admins are hidden, with one exception: a super admin who is the
    // project lead is shown, so the project is not presented as having no lead.
    if (isSuperAdmin && participant.role !== LEAD_ROLE) continue;
    const companyRole = companyRoleByUser.get(participant.userId) ?? null;
    const hasAccess = isSuperAdmin || companyRole !== null;

    members.push({
      userId: participant.userId,
      name: participant.user.name,
      phone: participant.user.phone,
      email: participant.user.email,
      kind:
        participant.role === LEAD_ROLE ? "LEAD" : companyRole === "admin" ? "COMPANY_ADMIN" : "PARTICIPANT",
      canEditProject:
        hasAccess &&
        (isSuperAdmin ||
          companyRole === "admin" ||
          participant.role === "OWNER" ||
          participant.role === "PROJECT_MANAGER"),
      isParticipant: true,
      hasAccess,
      addedAt: participant.createdAt.toISOString(),
    });
    listed.add(participant.userId);
  }

  for (const access of companyAccesses) {
    if (access.role !== "admin" || access.user.role === "super_admin" || listed.has(access.userId)) continue;
    members.push({
      userId: access.userId,
      name: access.user.name,
      phone: access.user.phone,
      email: access.user.email,
      kind: "COMPANY_ADMIN",
      canEditProject: true,
      isParticipant: false,
      hasAccess: true,
      addedAt: null,
    });
  }

  return members.sort((a, b) => {
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    return (a.name ?? "").localeCompare(b.name ?? "", "nb-NO", { sensitivity: "base" });
  });
}

export async function listProjectAccess(project: ProjectRef): Promise<ProjectAccessOverview> {
  const [participants, companyAccesses] = await Promise.all([
    prisma.projectParticipant.findMany({
      where: { projectId: project.id },
      select: { userId: true, role: true, createdAt: true, user: { select: USER_SELECT } },
    }),
    prisma.userCustomerAccess.findMany({
      where: { customerId: project.customerId },
      select: { userId: true, role: true, user: { select: USER_SELECT } },
    }),
  ]);

  const members = buildProjectAccessMembers(participants, companyAccesses);
  return {
    members,
    hasLead: members.some((member) => member.kind === "LEAD" && member.hasAccess),
  };
}

/** Company users who can be added: not admins (they have access already) and not yet participants. */
export async function listParticipantCandidates(project: ProjectRef): Promise<ProjectAccessCandidate[]> {
  const accesses = await prisma.userCustomerAccess.findMany({
    where: {
      customerId: project.customerId,
      role: "user",
      user: {
        role: { not: "super_admin" },
        projectParticipations: { none: { projectId: project.id } },
      },
    },
    select: { user: { select: { id: true, name: true, phone: true } } },
    orderBy: { user: { name: "asc" } },
  });

  return accesses.map((access) => ({
    userId: access.user.id,
    name: access.user.name,
    phone: access.user.phone,
  }));
}

/** Adds a user from the project's company as a participant with read access. */
export async function addProjectParticipant(project: ProjectRef, userId: string): Promise<ProjectAccessResult> {
  const eligibility = await checkCompanyUser(project, userId);
  if (!eligibility.ok) return eligibility;
  if (eligibility.companyRole === "admin") {
    return failure(400, "Selskapsadministratorer har allerede tilgang til alle prosjektene i selskapet.");
  }

  try {
    await prisma.projectParticipant.create({
      data: { projectId: project.id, userId, role: PARTICIPANT_ROLE },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return failure(409, "Brukeren har allerede tilgang til prosjektet.");
    throw error;
  }

  return { ok: true, userName: eligibility.userName };
}

/**
 * Makes the user project lead. Any other lead becomes an ordinary participant,
 * so the project keeps exactly one lead.
 */
export async function setProjectLead(project: ProjectRef, userId: string): Promise<ProjectAccessResult> {
  const eligibility = await checkCompanyUser(project, userId);
  if (!eligibility.ok) return eligibility;

  const previousLeads = await prisma.projectParticipant.findMany({
    where: { projectId: project.id, role: LEAD_ROLE, userId: { not: userId } },
    select: { user: { select: { name: true } } },
  });

  await prisma.$transaction([
    prisma.projectParticipant.updateMany({
      where: { projectId: project.id, role: LEAD_ROLE, userId: { not: userId } },
      data: { role: PARTICIPANT_ROLE },
    }),
    prisma.projectParticipant.upsert({
      where: { projectId_userId: { projectId: project.id, userId } },
      update: { role: LEAD_ROLE },
      create: { projectId: project.id, userId, role: LEAD_ROLE },
    }),
  ]);

  return {
    ok: true,
    userName: eligibility.userName,
    previousLeadNames: previousLeads.map((lead) => lead.user.name ?? "Ukjent bruker"),
  };
}

export async function removeProjectParticipant(
  project: ProjectRef,
  userId: string,
  actingUserId: string,
): Promise<ProjectAccessResult> {
  const participant = await prisma.projectParticipant.findUnique({
    where: { projectId_userId: { projectId: project.id, userId } },
    select: { role: true, user: { select: { name: true } } },
  });
  if (!participant) return failure(404, "Brukeren er ikke deltaker i prosjektet.");

  if (participant.role === LEAD_ROLE && userId === actingUserId) {
    return failure(400, "Overfør prosjektlederrollen til en annen bruker før du fjerner deg selv.");
  }

  await prisma.projectParticipant.delete({
    where: { projectId_userId: { projectId: project.id, userId } },
  });

  return { ok: true, userName: participant.user.name, removedRole: participant.role };
}

async function checkCompanyUser(
  project: ProjectRef,
  userId: string,
): Promise<{ ok: true; companyRole: CompanyRole; userName: string | null } | ProjectAccessFailure> {
  const access = await prisma.userCustomerAccess.findUnique({
    where: { userId_customerId: { userId, customerId: project.customerId } },
    select: { role: true, user: { select: { role: true, name: true } } },
  });

  if (!access) return failure(400, "Brukeren er ikke knyttet til selskapet som eier prosjektet.");
  if (access.user.role === "super_admin") {
    return failure(400, "Systemadministratorer har allerede tilgang til alle prosjekter.");
  }
  return { ok: true, companyRole: access.role, userName: access.user.name };
}

function failure(status: number, error: string): ProjectAccessFailure {
  return { ok: false, status, error };
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}
