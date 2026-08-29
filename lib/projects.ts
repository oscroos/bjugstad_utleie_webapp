import type { FieldType, ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ProjectListItem = {
  id: string;
  customerId: number;
  customerName: string | null;
  projectNumber: string;
  name: string;
  city: string | null;
  status: ProjectStatus;
  updatedAt: string;
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

const ARCHIVED_STATUS: ProjectStatus = "ARCHIVED";

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
      status: true,
      updatedAt: true,
      customer: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return projects.map((project) => ({
    id: project.id,
    customerId: project.customerId,
    customerName: project.customer.name,
    projectNumber: project.projectNumber,
    name: project.name,
    city: project.city,
    status: project.status,
    updatedAt: project.updatedAt.toISOString(),
  }));
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

function numberValue(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}
