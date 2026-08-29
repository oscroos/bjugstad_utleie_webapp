import { NextResponse } from "next/server";
import { FieldType, Prisma } from "@prisma/client";
import { requireSuperAdmin, writeAuditLog } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const FIELD_TYPES = Object.values(FieldType);
const MASS_UNITS = new Set(["m3", "tonn"]);

export async function GET() {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const [massTypes, fieldDefinitions] = await Promise.all([
    prisma.massTypeCatalog.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.projectFieldDefinition.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { label: "asc" }],
    }),
  ]);

  return NextResponse.json({ massTypes, fieldDefinitions });
}

export async function POST(request: Request) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });

  try {
    if (body.kind === "massType") {
      const payload = normalizeMassTypePayload(body, false);
      if (payload.error) return NextResponse.json({ error: payload.error }, { status: 400 });

      const massType = await prisma.massTypeCatalog.create({
        data: payload.data as Prisma.MassTypeCatalogCreateInput,
      });

      await writeAuditLog({
        userId: session.user.id,
        action: "admin.mass_type.create",
        entityType: "MassTypeCatalog",
        entityId: massType.id,
        metadata: { name: massType.name },
      });

      return NextResponse.json({ massType }, { status: 201 });
    }

    if (body.kind === "fieldDefinition") {
      const payload = normalizeFieldDefinitionPayload(body, false);
      if (payload.error) return NextResponse.json({ error: payload.error }, { status: 400 });

      const fieldDefinition = await prisma.projectFieldDefinition.create({
        data: payload.data as Prisma.ProjectFieldDefinitionCreateInput,
      });

      await writeAuditLog({
        userId: session.user.id,
        action: "admin.project_field.create",
        entityType: "ProjectFieldDefinition",
        entityId: fieldDefinition.id,
        metadata: { label: fieldDefinition.label },
      });

      return NextResponse.json({ fieldDefinition }, { status: 201 });
    }

    return NextResponse.json({ error: "Ukjent katalogtype" }, { status: 400 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "Navnet er allerede i bruk" }, { status: 409 });
    }
    console.error("Failed to create catalog entry", error);
    return NextResponse.json({ error: "Kunne ikke lagre katalogelement" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });

  const id = stringValue(body.id);
  if (!id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });

  try {
    if (body.kind === "massType") {
      const payload = normalizeMassTypePayload(body, true);
      if (payload.error) return NextResponse.json({ error: payload.error }, { status: 400 });

      const massType = await prisma.massTypeCatalog.update({
        where: { id },
        data: payload.data,
      });

      await writeAuditLog({
        userId: session.user.id,
        action: "admin.mass_type.update",
        entityType: "MassTypeCatalog",
        entityId: massType.id,
        metadata: { active: massType.active, name: massType.name },
      });

      return NextResponse.json({ massType });
    }

    if (body.kind === "fieldDefinition") {
      const payload = normalizeFieldDefinitionPayload(body, true);
      if (payload.error) return NextResponse.json({ error: payload.error }, { status: 400 });

      const fieldDefinition = await prisma.projectFieldDefinition.update({
        where: { id },
        data: payload.data,
      });

      await writeAuditLog({
        userId: session.user.id,
        action: "admin.project_field.update",
        entityType: "ProjectFieldDefinition",
        entityId: fieldDefinition.id,
        metadata: { active: fieldDefinition.active, label: fieldDefinition.label },
      });

      return NextResponse.json({ fieldDefinition });
    }

    return NextResponse.json({ error: "Ukjent katalogtype" }, { status: 400 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "Navnet er allerede i bruk" }, { status: 409 });
    }
    if (isRecordNotFoundError(error)) {
      return NextResponse.json({ error: "Katalogelementet finnes ikke" }, { status: 404 });
    }
    console.error("Failed to update catalog entry", error);
    return NextResponse.json({ error: "Kunne ikke oppdatere katalogelement" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });

  const id = stringValue(body.id);
  if (!id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });

  try {
    if (body.kind === "massType") {
      const usageCount = await prisma.projectMassType.count({ where: { massTypeId: id } });
      if (usageCount > 0) {
        const massType = await prisma.massTypeCatalog.update({
          where: { id },
          data: { active: false },
        });
        await writeAuditLog({
          userId: session.user.id,
          action: "admin.mass_type.deactivate",
          entityType: "MassTypeCatalog",
          entityId: massType.id,
          metadata: { usageCount, name: massType.name },
        });
        return NextResponse.json({ massType, mode: "deactivated" });
      }

      const massType = await prisma.massTypeCatalog.delete({ where: { id } });
      await writeAuditLog({
        userId: session.user.id,
        action: "admin.mass_type.delete",
        entityType: "MassTypeCatalog",
        entityId: massType.id,
        metadata: { name: massType.name },
      });
      return NextResponse.json({ massType, mode: "deleted" });
    }

    if (body.kind === "fieldDefinition") {
      const usageCount = await prisma.projectFieldValue.count({ where: { definitionId: id } });
      if (usageCount > 0) {
        const fieldDefinition = await prisma.projectFieldDefinition.update({
          where: { id },
          data: { active: false },
        });
        await writeAuditLog({
          userId: session.user.id,
          action: "admin.project_field.deactivate",
          entityType: "ProjectFieldDefinition",
          entityId: fieldDefinition.id,
          metadata: { usageCount, label: fieldDefinition.label },
        });
        return NextResponse.json({ fieldDefinition, mode: "deactivated" });
      }

      const fieldDefinition = await prisma.projectFieldDefinition.delete({ where: { id } });
      await writeAuditLog({
        userId: session.user.id,
        action: "admin.project_field.delete",
        entityType: "ProjectFieldDefinition",
        entityId: fieldDefinition.id,
        metadata: { label: fieldDefinition.label },
      });
      return NextResponse.json({ fieldDefinition, mode: "deleted" });
    }

    return NextResponse.json({ error: "Ukjent katalogtype" }, { status: 400 });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      return NextResponse.json({ error: "Katalogelementet finnes ikke" }, { status: 404 });
    }
    console.error("Failed to delete catalog entry", error);
    return NextResponse.json({ error: "Kunne ikke slette katalogelement" }, { status: 500 });
  }
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function normalizeMassTypePayload(
  body: Record<string, unknown>,
  partial: boolean,
): {
  data: Prisma.MassTypeCatalogCreateInput | Prisma.MassTypeCatalogUpdateInput;
  error: string | null;
} {
  const data: Prisma.MassTypeCatalogCreateInput | Prisma.MassTypeCatalogUpdateInput = {};
  const name = stringValue(body.name);

  if (!partial || body.name !== undefined) {
    if (!name) return { data, error: "Navn er påkrevd" };
    data.name = name;
  }

  if (!partial || body.unit !== undefined) {
    const unit = stringValue(body.unit) || "m3";
    if (!MASS_UNITS.has(unit)) return { data, error: "Enhet må være m3 eller tonn" };
    data.unit = unit;
  }

  if (!partial || body.defaultClassification !== undefined) {
    data.defaultClassification = stringValue(body.defaultClassification) || "UNKNOWN";
  }

  if (!partial || body.tonnPerM3 !== undefined) {
    const tonnPerM3 = numberValue(body.tonnPerM3, 1.6);
    if (tonnPerM3 <= 0) return { data, error: "Tonn per m3 må være større enn 0" };
    data.tonnPerM3 = tonnPerM3;
  }

  if (!partial || body.swellFactor !== undefined) {
    const swellFactor = numberValue(body.swellFactor, 1.0);
    if (swellFactor <= 0) return { data, error: "Svellefaktor må være større enn 0" };
    data.swellFactor = swellFactor;
  }

  if (!partial || body.sortOrder !== undefined) {
    data.sortOrder = integerValue(body.sortOrder, 0);
  }

  if (body.active !== undefined) {
    data.active = Boolean(body.active);
  }

  return { data, error: null };
}

function normalizeFieldDefinitionPayload(
  body: Record<string, unknown>,
  partial: boolean,
): {
  data: Prisma.ProjectFieldDefinitionCreateInput | Prisma.ProjectFieldDefinitionUpdateInput;
  error: string | null;
} {
  const data: Prisma.ProjectFieldDefinitionCreateInput | Prisma.ProjectFieldDefinitionUpdateInput = {};
  const label = stringValue(body.label);

  if (!partial || body.label !== undefined) {
    if (!label) return { data, error: "Etikett er påkrevd" };
    data.label = label;
  }

  if (!partial || body.fieldType !== undefined) {
    const fieldType = normalizeFieldType(body.fieldType);
    if (!fieldType) return { data, error: "Ugyldig felttype" };
    data.fieldType = fieldType;
  }

  if (!partial || body.options !== undefined) {
    data.options = normalizeOptions(body.options);
  }

  if (!partial || body.required !== undefined) {
    data.required = Boolean(body.required);
  }

  if (!partial || body.sortOrder !== undefined) {
    data.sortOrder = integerValue(body.sortOrder, 0);
  }

  if (body.active !== undefined) {
    data.active = Boolean(body.active);
  }

  return { data, error: null };
}

function normalizeFieldType(value: unknown): FieldType | null {
  if (typeof value !== "string") return "TEXT";
  return FIELD_TYPES.includes(value as FieldType) ? (value as FieldType) : null;
}

function normalizeOptions(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,/)
      : [];

  return [...new Set(raw.map((item) => stringValue(item)).filter(Boolean))];
}

function numberValue(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerValue(value: unknown, fallback: number): number {
  const parsed = numberValue(value, fallback);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isRecordNotFoundError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
