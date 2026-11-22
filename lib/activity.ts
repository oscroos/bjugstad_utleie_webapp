import {
  AUDIT_CATEGORY_LABELS,
  describeAuditAction,
  parseAuditChanges,
  readAuditString,
  type AuditCategory,
  type AuditChange,
} from "@/lib/audit";
import { normalizeError, type AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

// The Aktivitet page for super admins: logins plus everything in the audit log,
// newest first, each entry connected to the user, company and project it concerns.

export type ActivityUser = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
};

export type ActivityItem = {
  id: string;
  at: string;
  category: AuditCategory;
  categoryLabel: string;
  description: string;
  /** Null for entries without a user (for example an inbound integration call). */
  user: ActivityUser | null;
  /** True when the entry names a user who has since been deleted. */
  userDeleted: boolean;
  customer: { id: number; name: string | null } | null;
  /** `exists` is false when the project has been deleted; the label is then the stored snapshot. */
  project: { id: string; label: string; exists: boolean } | null;
  changes: AuditChange[];
};

export type ActivityResult = {
  items: ActivityItem[];
  error: AppError | null;
};

type AuditRow = {
  id: string;
  customerId: number | null;
  userId: string | null;
  projectId: string | null;
  action: string;
  metadata: unknown;
  createdAt: Date;
};

type LoginRow = {
  id: string;
  provider: string | null;
  loggedAt: Date;
  user: ActivityUser | null;
};

type Lookups = {
  users: Map<string, ActivityUser>;
  customers: Map<number, string | null>;
  projects: Map<string, { projectNumber: string; name: string; customerId: number }>;
};

const AUDIT_LIMIT = 500;
const LOGIN_LIMIT = 200;
const USER_SELECT = { id: true, name: true, phone: true, email: true, role: true } as const;

const LEGACY_USER_KEYS = ["participantUserId", "leadUserId"] as const;

/**
 * Access entries written before old and new values were stored only carry the
 * affected user's id. This rebuilds the values that can still be known from it.
 */
function legacyAccessChanges(row: AuditRow, lookups: Lookups): AuditChange[] {
  const nameOf = (key: (typeof LEGACY_USER_KEYS)[number]) => {
    const userId = readAuditString(row.metadata, key);
    if (!userId) return null;
    return lookups.users.get(userId)?.name?.trim() || "Slettet bruker";
  };

  if (row.action === "project.lead.changed") {
    const name = nameOf("leadUserId");
    // Who was lead before was not recorded at the time.
    return name ? [{ label: "Prosjektleder", from: "Ikke registrert", to: name }] : [];
  }
  if (row.action === "project.participant.added") {
    const name = nameOf("participantUserId");
    return name ? [{ label: "Deltaker", from: null, to: name }] : [];
  }
  if (row.action === "project.participant.removed") {
    const name = nameOf("participantUserId");
    return name ? [{ label: "Deltaker", from: name, to: null }] : [];
  }
  return [];
}

export function toAuditActivity(row: AuditRow, lookups: Lookups): ActivityItem {
  const stored = parseAuditChanges(row.metadata);
  const changes = stored.length > 0 ? stored : legacyAccessChanges(row, lookups);
  const { category, label } = describeAuditAction(row.action, changes);
  const project = row.projectId ? lookups.projects.get(row.projectId) : undefined;
  const customerId = row.customerId ?? project?.customerId ?? null;

  return {
    id: `audit-${row.id}`,
    at: row.createdAt.toISOString(),
    category,
    categoryLabel: AUDIT_CATEGORY_LABELS[category],
    description: label,
    user: row.userId ? lookups.users.get(row.userId) ?? null : null,
    userDeleted: Boolean(row.userId) && !lookups.users.has(row.userId as string),
    customer: customerId === null ? null : { id: customerId, name: lookups.customers.get(customerId) ?? null },
    project: row.projectId
      ? {
          id: row.projectId,
          label: project
            ? `${project.projectNumber} ${project.name}`
            : readAuditString(row.metadata, "projectLabel") ?? "Slettet prosjekt",
          exists: Boolean(project),
        }
      : null,
    changes,
  };
}

export function toLoginActivity(row: LoginRow): ActivityItem {
  const provider = row.provider?.trim();
  const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "ukjent metode";
  return {
    id: `login-${row.id}`,
    at: row.loggedAt.toISOString(),
    category: "LOGIN",
    categoryLabel: AUDIT_CATEGORY_LABELS.LOGIN,
    description: `Logget inn med ${providerLabel}`,
    user: row.user,
    userDeleted: false,
    customer: null,
    project: null,
    changes: [],
  };
}

export async function loadActivityForAdmin(): Promise<ActivityResult> {
  try {
    const [auditRows, loginRows] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: AUDIT_LIMIT,
        select: {
          id: true,
          customerId: true,
          userId: true,
          projectId: true,
          action: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.userLoginEvent.findMany({
        orderBy: { loggedAt: "desc" },
        take: LOGIN_LIMIT,
        select: { id: true, provider: true, loggedAt: true, user: { select: USER_SELECT } },
      }),
    ]);

    const userIds = unique([
      ...auditRows.map((row) => row.userId),
      // Users named in older access entries, see legacyAccessChanges.
      ...auditRows.flatMap((row) => LEGACY_USER_KEYS.map((key) => readAuditString(row.metadata, key))),
    ]);
    const projectIds = unique(auditRows.map((row) => row.projectId));

    const [users, projects] = await Promise.all([
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: USER_SELECT }) : [],
      projectIds.length
        ? prisma.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, projectNumber: true, name: true, customerId: true },
          })
        : [],
    ]);

    const customerIds = unique<number>([
      ...auditRows.map((row) => row.customerId),
      ...projects.map((project) => project.customerId),
    ]);
    const customers = customerIds.length
      ? await prisma.customer.findMany({
          where: { customer_id: { in: customerIds } },
          select: { customer_id: true, name: true },
        })
      : [];

    const lookups: Lookups = {
      users: new Map(users.map((user) => [user.id, user])),
      customers: new Map(customers.map((customer) => [customer.customer_id, customer.name])),
      projects: new Map(projects.map((project) => [project.id, project])),
    };

    const items = [
      ...auditRows.map((row) => toAuditActivity(row, lookups)),
      ...loginRows.map(toLoginActivity),
    ].sort((a, b) => b.at.localeCompare(a.at));

    return { items, error: null };
  } catch (error) {
    return {
      items: [],
      error: normalizeError(error, {
        title: "Kunne ikke hente aktivitet",
        message:
          error instanceof Error && error.message ? error.message : "Vi klarte ikke å hente aktivitet akkurat nå.",
      }),
    };
  }
}

function unique<T extends string | number>(values: Array<T | null | undefined>): T[] {
  return [...new Set(values.filter((value): value is T => value !== null && value !== undefined))];
}
