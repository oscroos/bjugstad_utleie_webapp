import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

// ────────────────────────────────────────────────────────────────────────────
//  SIKKERHETSLAG – brukes av alle API-ruter
//  1) requireProjectRole  – håndhever ProjectRole, ikke bare org-tilhørighet
//  2) checkAiQuota        – rate limiting + cache for AI-kall
//  3) audit               – sporbar logg av alle vesentlige handlinger
// ────────────────────────────────────────────────────────────────────────────

// Rollehierarki: høyere tall = mer tilgang
const ROLE_LEVEL: Record<string, number> = {
  VIEWER: 1,
  MEMBER: 2,
  PROJECT_MANAGER: 3,
  OWNER: 4,
};

export type MinRole = "VIEWER" | "MEMBER" | "PROJECT_MANAGER" | "OWNER";

/**
 * Verifiserer at brukeren har MINST angitt rolle på prosjektet.
 * Erstatter assertProjectAccess der handlingen krever mer enn lesetilgang.
 * Returnerer prosjektet + brukerens rolle, eller null.
 *
 * Regel som håndheves i rutene:
 *   VIEWER          – lese alt
 *   MEMBER          – registrere data (RUH, forbruk, rapportutkast)
 *   PROJECT_MANAGER – bekrefte/avvise krav, sende rapporter, styre UE/deltakere
 *   OWNER           – slette/arkivere prosjekt
 */
export async function requireProjectRole(
  projectId: string,
  userId: string,
  organizationId: string,
  minRole: MinRole
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: {
      id: true,
      projectNumber: true,
      name: true,
      participants: { where: { userId }, select: { role: true } },
    },
  });
  if (!project) return null;

  const role = project.participants[0]?.role ?? null;
  if (!role) return null; // ikke deltaker på prosjektet
  if (ROLE_LEVEL[role] < ROLE_LEVEL[minRole]) return null;

  return { id: project.id, projectNumber: project.projectNumber, name: project.name, role };
}

// ── Rate limiting + cache for AI ─────────────────────────────────────────────

const AI_DAILY_LIMITS: Record<string, number> = {
  analyse: Number(process.env.AI_LIMIT_ANALYSE ?? 10),
  report: Number(process.env.AI_LIMIT_REPORT ?? 50),
  minijurist: Number(process.env.AI_LIMIT_MINIJURIST ?? 100),
};

export function hashInput(parts: (string | null | undefined)[]): string {
  return createHash("sha256").update(parts.filter(Boolean).join("||")).digest("hex");
}

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
  cachedResultRef: string | null; // satt ved cache-treff – ikke kall AI på nytt
}

/**
 * Sjekker dagskvote for org + AI-type, og ser etter cache-treff på inputHash.
 * Cache-treff teller IKKE mot kvoten (og sparer API-kostnad).
 */
export async function checkAiQuota(
  organizationId: string,
  kind: "analyse" | "report" | "minijurist",
  inputHash?: string
): Promise<QuotaResult> {
  // Cache-treff først (siste 7 dager)
  if (inputHash) {
    const hit = await prisma.aiUsage.findFirst({
      where: {
        inputHash,
        kind,
        resultRef: { not: null },
        createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
      orderBy: { createdAt: "desc" },
      select: { resultRef: true },
    });
    if (hit?.resultRef) {
      return { allowed: true, remaining: -1, cachedResultRef: hit.resultRef };
    }
  }

  const midnatt = new Date();
  midnatt.setHours(0, 0, 0, 0);
  const used = await prisma.aiUsage.count({
    where: { organizationId, kind, createdAt: { gte: midnatt } },
  });
  const limit = AI_DAILY_LIMITS[kind];
  return { allowed: used < limit, remaining: Math.max(0, limit - used), cachedResultRef: null };
}

/** Registrerer et AI-kall (etter vellykket kjøring), evt. med cache-referanse. */
export async function recordAiUsage(
  organizationId: string,
  kind: string,
  inputHash?: string,
  resultRef?: string
) {
  await prisma.aiUsage.create({
    data: { organizationId, kind, inputHash: inputHash ?? null, resultRef: resultRef ?? null },
  });
}

// ── Audit-logg ───────────────────────────────────────────────────────────────

/**
 * Logger en vesentlig handling. Kalles fra rutene ETTER at handlingen lyktes.
 * Feiler stille (logging skal aldri velte forretningsoperasjonen).
 */
export async function audit(params: {
  organizationId: string;
  userId?: string | null;
  action: string;      // "project.create", "requirement.confirm", "standard.upload" ...
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        metadata: (params.metadata ?? undefined) as never,
      },
    });
  } catch (err) {
    console.error("Audit-logg feilet:", err);
  }
}
