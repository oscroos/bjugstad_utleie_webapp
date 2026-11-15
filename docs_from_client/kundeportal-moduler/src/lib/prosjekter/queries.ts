import { prisma } from "@/lib/prisma";
import type { ProjectListItem } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────────
//  DELT PROSJEKT-DATALAG
//
//  Dette er kilden ALLE andre moduler (rapportering, "minijuristen",
//  "massehåndtering") henter prosjekter fra. Ny modul som skal knyttes til et
//  prosjekt kaller listProjectsForOrg() til dropdown og assertProjectAccess()
//  for å verifisere tilgang – da slipper hver modul egen prosjektlogikk.
// ────────────────────────────────────────────────────────────────────────────

/** Prosjekter en organisasjon har tilgang til – brukes av ProsjektVelger. */
export async function listProjectsForOrg(
  organizationId: string
): Promise<ProjectListItem[]> {
  const projects = await prisma.project.findMany({
    where: { organizationId, status: { not: "ARCHIVED" } },
    select: { id: true, projectNumber: true, name: true, city: true, status: true },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  return projects;
}

/**
 * Verifiserer at prosjektet finnes og tilhører organisasjonen. Returnerer
 * prosjektet eller null. Bruk denne øverst i enhver modul-rute som tar imot
 * en projectId fra dropdownen, slik at ingen kan velge fremmede prosjekter.
 */
export async function assertProjectAccess(projectId: string, organizationId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, projectNumber: true, name: true, organizationId: true },
  });
}

/** Fullt prosjekt med deltakere og UE – brukes av detaljsiden. */
export async function getProjectDetail(projectId: string, organizationId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, organizationId },
    include: {
      participants: { include: { user: { select: { id: true, name: true, email: true } } } },
      subcontractors: {
        include: {
          subcontractorOrg: { select: { id: true, name: true, orgNumber: true } },
        },
      },
    },
  });
}
