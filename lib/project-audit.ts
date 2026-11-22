import type { ClientType, ContractType, FieldType, ProjectStatus } from "@prisma/client";
import { auditDate, auditNumber, type AuditSnapshot } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { CLIENT_TYPE_LABELS, CONTRACT_TYPE_LABELS, PROJECT_STATUS_LABELS } from "@/lib/project-status";

// Turns a project's editable setup into label -> display value, so that two
// snapshots (before and after a save) can be compared for the activity log.
// The labels are the ones the user sees on the project page.

export type ProjectAuditSource = {
  name: string;
  description: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  contractType: ContractType | null;
  contractSizeNok: number | null;
  clientType: ClientType | null;
  clientName: string | null;
  clientAddress: string | null;
  clientEmail: string | null;
  clientContactName: string | null;
  clientContactEmail: string | null;
  clientContactPhone: string | null;
  status: ProjectStatus;
  startDate: Date | null;
  endDate: Date | null;
  fieldValues: Array<{ value: string; definition: { label: string; fieldType: FieldType } }>;
  massTypes: Array<{ plannedIn: number; plannedOut: number; massType: { name: string; unit: string } }>;
  kpis: Array<{
    label: string;
    targetValue: number;
    currentValue: number | null;
    unit: string;
    contractRef: string | null;
  }>;
};

export function buildProjectSnapshot(project: ProjectAuditSource): AuditSnapshot {
  const snapshot: AuditSnapshot = {
    Prosjektnavn: project.name,
    Beskrivelse: project.description,
    Adresse: project.addressLine,
    Postnummer: project.postalCode,
    Poststed: project.city,
    Kontraktstype: project.contractType ? CONTRACT_TYPE_LABELS[project.contractType] : null,
    Kontraktssum: auditNumber(project.contractSizeNok, "kr"),
    Byggherretype: project.clientType ? CLIENT_TYPE_LABELS[project.clientType] : null,
    Byggherre: project.clientName,
    "Byggherre adresse": project.clientAddress,
    "Byggherre e-post": project.clientEmail,
    "Byggherre kontaktperson": project.clientContactName,
    "Kontaktperson e-post": project.clientContactEmail,
    "Kontaktperson telefon": project.clientContactPhone,
    Status: PROJECT_STATUS_LABELS[project.status],
    Oppstart: auditDate(project.startDate),
    Sluttfrist: auditDate(project.endDate),
  };

  for (const fieldValue of project.fieldValues) {
    setUnique(snapshot, `Felt «${fieldValue.definition.label}»`, customFieldText(fieldValue));
  }

  for (const row of project.massTypes) {
    const unit = row.massType.unit;
    setUnique(
      snapshot,
      `Masseplan ${row.massType.name}`,
      `inn ${auditNumber(row.plannedIn, unit)}, ut ${auditNumber(row.plannedOut, unit)}`,
    );
  }

  for (const kpi of project.kpis) {
    const parts = [
      `mål ${auditNumber(kpi.targetValue, kpi.unit)}`,
      `målt ${auditNumber(kpi.currentValue, kpi.unit) ?? "ikke registrert"}`,
      kpi.contractRef ? `ref. ${kpi.contractRef}` : null,
    ];
    setUnique(snapshot, `Kontraktsmål «${kpi.label}»`, parts.filter(Boolean).join(", "));
  }

  return snapshot;
}

export async function loadProjectSnapshot(projectId: string): Promise<AuditSnapshot | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      fieldValues: {
        select: { value: true, definition: { select: { label: true, fieldType: true } } },
        orderBy: { definition: { sortOrder: "asc" } },
      },
      massTypes: {
        select: { plannedIn: true, plannedOut: true, massType: { select: { name: true, unit: true } } },
        orderBy: { massType: { sortOrder: "asc" } },
      },
      kpis: {
        select: { label: true, targetValue: true, currentValue: true, unit: true, contractRef: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return project ? buildProjectSnapshot(project) : null;
}

function customFieldText(fieldValue: ProjectAuditSource["fieldValues"][number]): string | null {
  const value = fieldValue.value.trim();
  if (!value) return null;
  if (fieldValue.definition.fieldType === "BOOLEAN") return value === "true" ? "Ja" : "Nei";
  return value;
}

/** Two rows with the same label (for example two goals named alike) get a running number. */
function setUnique(snapshot: AuditSnapshot, label: string, value: string | null) {
  let key = label;
  for (let index = 2; key in snapshot; index += 1) key = `${label} (${index})`;
  snapshot[key] = value;
}
