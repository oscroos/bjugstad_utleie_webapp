import type { ClientType, ContractType, FieldType, KpiMetric, ProjectStatus } from "@prisma/client";
import {
  evaluateProjectKpi,
  KPI_METRIC_LABELS,
  KPI_METRIC_OPTIONS,
  summarizeProjectDeviations,
  type EvaluatedProjectKpi,
  type KpiMetricValue,
  type ProjectDeviationLevel,
} from "@/lib/project-status";
import { prisma } from "@/lib/prisma";

export type ProjectListItem = {
  id: string;
  customerId: number;
  customerName: string | null;
  projectNumber: string;
  name: string;
  city: string | null;
  clientName: string | null;
  contractType: ContractType | null;
  status: ProjectStatus;
  updatedAt: string;
  deviationLevel: ProjectDeviationLevel;
  deviationLabel: string;
  issueCount: number;
  issues: string[];
};

export type ProjectCustomerOption = {
  id: number;
  name: string | null;
  organizationNumber: string | null;
};

export type CatalogFieldDefinition = {
  id: string;
  label: string;
  fieldType: FieldType;
  options: string[];
  required: boolean;
  active: boolean;
  sortOrder: number;
};

export type CatalogMassType = {
  id: string;
  name: string;
  unit: string;
  defaultClassification: string;
  tonnPerM3: number;
  swellFactor: number;
  active: boolean;
  sortOrder: number;
};

export type NormalizedProjectFieldValue = {
  definitionId: string;
  value: string;
};

export type NormalizedProjectMassType = {
  massTypeId: string;
  plannedIn: number;
  plannedOut: number;
};

export type NormalizedProjectKpi = {
  metric: KpiMetric;
  label: string;
  targetValue: number;
  currentValue: number | null;
  unit: string;
  contractRef: string | null;
};

export type ProjectWorkspace = {
  id: string;
  customerId: number;
  customerName: string | null;
  projectNumber: string;
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
  startDate: string | null;
  endDate: string | null;
  updatedAt: string;
  fieldValues: Array<{
    definitionId: string;
    label: string;
    fieldType: FieldType;
    value: string;
  }>;
  massTypes: Array<{
    id: string;
    massTypeId: string;
    name: string;
    unit: string;
    tonnPerM3: number;
    plannedIn: number;
    plannedOut: number;
  }>;
  kpis: EvaluatedProjectKpi[];
  deviations: {
    level: ProjectDeviationLevel;
    label: string;
    issues: string[];
  };
};

const ARCHIVED_STATUS: ProjectStatus = "ARCHIVED";
const KPI_METRIC_VALUES = new Set(KPI_METRIC_OPTIONS.map((option) => option.value));

export async function listProjectsForUser(
  userId: string,
  role?: string | null,
): Promise<ProjectListItem[]> {
  const where =
    role === "super_admin"
      ? { status: { not: ARCHIVED_STATUS } }
      : {
          status: { not: ARCHIVED_STATUS },
          customer: {
            accesses: {
              some: { userId },
            },
          },
        };

  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true,
      customerId: true,
      projectNumber: true,
      name: true,
      city: true,
      clientName: true,
      contractType: true,
      status: true,
      updatedAt: true,
      customer: {
        select: {
          name: true,
        },
      },
      kpis: {
        select: {
          id: true,
          metric: true,
          label: true,
          targetValue: true,
          currentValue: true,
          unit: true,
          contractRef: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return projects.map((project) => {
    const kpis = project.kpis.map((kpi) =>
      evaluateProjectKpi({
        id: kpi.id,
        metric: kpi.metric,
        label: kpi.label,
        targetValue: kpi.targetValue,
        currentValue: kpi.currentValue,
        unit: kpi.unit,
        contractRef: kpi.contractRef,
      }),
    );
    const deviations = summarizeProjectDeviations(kpis);

    return {
      id: project.id,
      customerId: project.customerId,
      customerName: project.customer.name,
      projectNumber: project.projectNumber,
      name: project.name,
      city: project.city,
      clientName: project.clientName,
      contractType: project.contractType,
      status: project.status,
      updatedAt: project.updatedAt.toISOString(),
      deviationLevel: deviations.level,
      deviationLabel: deviations.label,
      issueCount: deviations.issues.length,
      issues: deviations.issues,
    };
  });
}

export async function listProjectCustomersForUser(
  userId: string,
  role?: string | null,
): Promise<ProjectCustomerOption[]> {
  if (role === "super_admin") {
    const customers = await prisma.customer.findMany({
      select: {
        customer_id: true,
        name: true,
        organization_number: true,
      },
      orderBy: { name: "asc" },
    });

    return customers.map((customer) => ({
      id: customer.customer_id,
      name: customer.name,
      organizationNumber: customer.organization_number,
    }));
  }

  const accesses = await prisma.userCustomerAccess.findMany({
    where: { userId, role: "admin" },
    select: {
      customer: {
        select: {
          customer_id: true,
          name: true,
          organization_number: true,
        },
      },
    },
    orderBy: {
      customer: {
        name: "asc",
      },
    },
  });

  return accesses.map((access) => ({
    id: access.customer.customer_id,
    name: access.customer.name,
    organizationNumber: access.customer.organization_number,
  }));
}

export async function getActiveProjectSetupCatalog() {
  const [fieldDefinitions, massTypes] = await Promise.all([
    prisma.projectFieldDefinition.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: {
        id: true,
        label: true,
        fieldType: true,
        options: true,
        required: true,
        active: true,
        sortOrder: true,
      },
    }),
    prisma.massTypeCatalog.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        unit: true,
        defaultClassification: true,
        tonnPerM3: true,
        swellFactor: true,
        active: true,
        sortOrder: true,
      },
    }),
  ]);

  return { fieldDefinitions, massTypes };
}

export async function getProjectWorkspace(projectId: string): Promise<ProjectWorkspace | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      customer: {
        select: {
          customer_id: true,
          name: true,
        },
      },
      fieldValues: {
        include: {
          definition: true,
        },
        orderBy: {
          definition: {
            sortOrder: "asc",
          },
        },
      },
      massTypes: {
        include: {
          massType: true,
        },
        orderBy: {
          massType: {
            sortOrder: "asc",
          },
        },
      },
      kpis: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!project) return null;

  const kpis = project.kpis.map((kpi) =>
    evaluateProjectKpi({
      id: kpi.id,
      metric: kpi.metric,
      label: kpi.label,
      targetValue: kpi.targetValue,
      currentValue: kpi.currentValue,
      unit: kpi.unit,
      contractRef: kpi.contractRef,
    }),
  );
  const deviations = summarizeProjectDeviations(kpis);

  return {
    id: project.id,
    customerId: project.customerId,
    customerName: project.customer.name,
    projectNumber: project.projectNumber,
    name: project.name,
    description: project.description,
    addressLine: project.addressLine,
    postalCode: project.postalCode,
    city: project.city,
    contractType: project.contractType,
    contractSizeNok: project.contractSizeNok,
    clientType: project.clientType,
    clientName: project.clientName,
    clientAddress: project.clientAddress,
    clientEmail: project.clientEmail,
    clientContactName: project.clientContactName,
    clientContactEmail: project.clientContactEmail,
    clientContactPhone: project.clientContactPhone,
    status: project.status,
    startDate: project.startDate?.toISOString() ?? null,
    endDate: project.endDate?.toISOString() ?? null,
    updatedAt: project.updatedAt.toISOString(),
    fieldValues: project.fieldValues.map((fieldValue) => ({
      definitionId: fieldValue.definitionId,
      label: fieldValue.definition.label,
      fieldType: fieldValue.definition.fieldType,
      value: fieldValue.value,
    })),
    massTypes: project.massTypes.map((massType) => ({
      id: massType.id,
      massTypeId: massType.massTypeId,
      name: massType.massType.name,
      unit: massType.massType.unit,
      tonnPerM3: massType.massType.tonnPerM3,
      plannedIn: massType.plannedIn,
      plannedOut: massType.plannedOut,
    })),
    kpis,
    deviations,
  };
}

export function normalizeProjectFieldValues(
  definitions: CatalogFieldDefinition[],
  rawValues: unknown,
): { values: NormalizedProjectFieldValue[]; error: string | null } {
  const inputRows = Array.isArray(rawValues) ? rawValues : [];
  const rawByDefinition = new Map<string, unknown>();

  for (const row of inputRows) {
    if (!isRecord(row)) continue;
    const definitionId = stringValue(row.definitionId);
    if (!definitionId) continue;
    rawByDefinition.set(definitionId, row.value);
  }

  const values: NormalizedProjectFieldValue[] = [];

  for (const definition of definitions) {
    const normalized = normalizeFieldValue(definition, rawByDefinition.get(definition.id));
    if (normalized.error) return { values: [], error: normalized.error };

    if (definition.required && !normalized.value) {
      return {
        values: [],
        error: `Feltet "${definition.label}" er påkrevd.`,
      };
    }

    values.push({ definitionId: definition.id, value: normalized.value });
  }

  return { values, error: null };
}

export function normalizeProjectMassTypes(
  catalog: CatalogMassType[],
  rawValues: unknown,
): { values: NormalizedProjectMassType[]; error: string | null } {
  if (!Array.isArray(rawValues)) return { values: [], error: null };

  const activeIds = new Set(catalog.map((massType) => massType.id));
  const seen = new Set<string>();
  const values: NormalizedProjectMassType[] = [];

  for (const row of rawValues) {
    if (!isRecord(row)) continue;
    const massTypeId = stringValue(row.massTypeId);
    if (!massTypeId) continue;
    if (!activeIds.has(massTypeId)) {
      return { values: [], error: "Valgt massetype finnes ikke eller er deaktivert." };
    }
    if (seen.has(massTypeId)) continue;
    seen.add(massTypeId);

    const plannedIn = numberValue(row.plannedIn, 0);
    const plannedOut = numberValue(row.plannedOut, 0);
    if (plannedIn < 0 || plannedOut < 0) {
      return { values: [], error: "Planlagt inn/ut kan ikke være negativt." };
    }

    values.push({ massTypeId, plannedIn, plannedOut });
  }

  return { values, error: null };
}

export function normalizeProjectKpis(
  rawValues: unknown,
): { values: NormalizedProjectKpi[]; error: string | null } {
  if (!Array.isArray(rawValues)) return { values: [], error: null };

  const values: NormalizedProjectKpi[] = [];

  for (const row of rawValues) {
    if (!isRecord(row)) continue;

    const rawMetric = stringValue(row.metric) as KpiMetricValue;
    if (!KPI_METRIC_VALUES.has(rawMetric)) {
      return { values: [], error: "Kontraktsmål har ugyldig type." };
    }

    const targetValue = requiredNumberValue(row.targetValue);
    if (targetValue === null || targetValue < 0) {
      return { values: [], error: "Målverdi på kontraktsmål må være 0 eller høyere." };
    }

    const currentValue = optionalNumberValue(row.currentValue);
    if (currentValue.error) return { values: [], error: currentValue.error };
    if (currentValue.value !== null && currentValue.value < 0) {
      return { values: [], error: "Målt verdi på kontraktsmål kan ikke være negativ." };
    }

    const label = stringValue(row.label) || KPI_METRIC_LABELS[rawMetric];
    const unit = stringValue(row.unit) || defaultKpiUnit(rawMetric);
    if (!label) return { values: [], error: "Kontraktsmål mangler navn." };
    if (!unit) return { values: [], error: "Kontraktsmål mangler enhet." };

    values.push({
      metric: rawMetric as KpiMetric,
      label,
      targetValue,
      currentValue: currentValue.value,
      unit,
      contractRef: nullableStringValue(row.contractRef),
    });
  }

  return { values, error: null };
}

function normalizeFieldValue(
  definition: CatalogFieldDefinition,
  rawValue: unknown,
): { value: string; error: string | null } {
  if (definition.fieldType === "BOOLEAN") {
    if (typeof rawValue === "boolean") return { value: rawValue ? "true" : "false", error: null };
    const value = stringValue(rawValue).toLowerCase();
    if (!value) return { value: "", error: null };
    if (value === "true" || value === "false") return { value, error: null };
    return { value: "", error: `Feltet "${definition.label}" må være ja eller nei.` };
  }

  const value = stringValue(rawValue);
  if (!value) return { value: "", error: null };

  if (definition.fieldType === "NUMBER" && !Number.isFinite(Number(value))) {
    return { value: "", error: `Feltet "${definition.label}" må være et tall.` };
  }

  if (definition.fieldType === "DATE" && Number.isNaN(new Date(value).getTime())) {
    return { value: "", error: `Feltet "${definition.label}" må være en gyldig dato.` };
  }

  if (definition.fieldType === "SELECT" && !definition.options.includes(value)) {
    return { value: "", error: `Feltet "${definition.label}" har et ugyldig valg.` };
  }

  return { value, error: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableStringValue(value: unknown): string | null {
  const normalized = stringValue(value);
  return normalized || null;
}

function numberValue(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requiredNumberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalNumberValue(value: unknown): { value: number | null; error: string | null } {
  if (value === null || value === undefined || value === "") return { value: null, error: null };
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: "Målt verdi på kontraktsmål må være et tall." };
  }
  return { value: parsed, error: null };
}

function defaultKpiUnit(metric: KpiMetricValue) {
  return KPI_METRIC_OPTIONS.find((option) => option.value === metric)?.defaultUnit ?? "";
}
