import { NextResponse } from "next/server";
import { requireProjectRole, writeAuditLog } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import {
  getActiveProjectSetupCatalog,
  normalizeProjectFieldValues,
  normalizeProjectKpis,
  normalizeProjectMassTypes,
} from "@/lib/projects";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

const CONTRACT_TYPES = ["NS_8405", "NS_8406", "NS_8407", "NS_8417", "OTHER"] as const;
const CLIENT_TYPES = ["PUBLIC", "PRIVATE"] as const;
const PROJECT_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const;

export async function GET(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const access = await requireProjectRole(projectId, "VIEWER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const [project, catalog] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: {
        customer: {
          select: {
            customer_id: true,
            name: true,
            organization_number: true,
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
    }),
    getActiveProjectSetupCatalog(),
  ]);

  if (!project) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  return NextResponse.json({
    project,
    fieldDefinitions: catalog.fieldDefinitions,
    massTypes: catalog.massTypes,
  });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const access = await requireProjectRole(projectId, "PROJECT_MANAGER");
  if (!access) return NextResponse.json({ error: "Krever prosjekttilgang" }, { status: 403 });

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });

  const startDate = optionalDateValue(body.startDate);
  const endDate = optionalDateValue(body.endDate);
  if (startDate.error || endDate.error) {
    return NextResponse.json({ error: startDate.error ?? endDate.error }, { status: 400 });
  }

  if (body.name !== undefined && !stringValue(body.name)) {
    return NextResponse.json({ error: "Prosjektnavn er påkrevd" }, { status: 400 });
  }

  const contractType = optionalEnumValue(body.contractType, CONTRACT_TYPES);
  const clientType = optionalEnumValue(body.clientType, CLIENT_TYPES);
  const projectStatus = optionalEnumValue(body.status, PROJECT_STATUSES);
  if (contractType.error || clientType.error || projectStatus.error) {
    return NextResponse.json(
      { error: contractType.error ?? clientType.error ?? projectStatus.error },
      { status: 400 },
    );
  }

  const contractSizeNok = optionalNumberValue(body.contractSizeNok);
  if (contractSizeNok.error) {
    return NextResponse.json({ error: contractSizeNok.error }, { status: 400 });
  }

  const { fieldDefinitions, massTypes } = await getActiveProjectSetupCatalog();
  const fieldPayload = normalizeProjectFieldValues(fieldDefinitions, body.fieldValues);
  if (fieldPayload.error) return NextResponse.json({ error: fieldPayload.error }, { status: 400 });

  const massTypePayload = normalizeProjectMassTypes(massTypes, body.massTypes);
  if (massTypePayload.error) {
    return NextResponse.json({ error: massTypePayload.error }, { status: 400 });
  }

  const kpiPayload = normalizeProjectKpis(body.kpis);
  if (kpiPayload.error) return NextResponse.json({ error: kpiPayload.error }, { status: 400 });

  const nextStatus = body.status !== undefined ? projectStatus.value ?? undefined : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: {
        name: body.name !== undefined ? stringValue(body.name) : undefined,
        description: body.description !== undefined ? nullableStringValue(body.description) : undefined,
        addressLine: body.addressLine !== undefined ? nullableStringValue(body.addressLine) : undefined,
        postalCode: body.postalCode !== undefined ? nullableStringValue(body.postalCode) : undefined,
        city: body.city !== undefined ? nullableStringValue(body.city) : undefined,
        contractType: body.contractType !== undefined ? contractType.value : undefined,
        contractSizeNok: body.contractSizeNok !== undefined ? contractSizeNok.value : undefined,
        clientType: body.clientType !== undefined ? clientType.value : undefined,
        clientName: body.clientName !== undefined ? nullableStringValue(body.clientName) : undefined,
        clientAddress: body.clientAddress !== undefined ? nullableStringValue(body.clientAddress) : undefined,
        clientEmail: body.clientEmail !== undefined ? nullableStringValue(body.clientEmail) : undefined,
        clientContactName:
          body.clientContactName !== undefined ? nullableStringValue(body.clientContactName) : undefined,
        clientContactEmail:
          body.clientContactEmail !== undefined ? nullableStringValue(body.clientContactEmail) : undefined,
        clientContactPhone:
          body.clientContactPhone !== undefined ? nullableStringValue(body.clientContactPhone) : undefined,
        status: nextStatus,
        startDate: body.startDate !== undefined ? startDate.value : undefined,
        endDate: body.endDate !== undefined ? endDate.value : undefined,
      },
    });

    await tx.projectFieldValue.deleteMany({ where: { projectId } });
    if (fieldPayload.values.length) {
      await tx.projectFieldValue.createMany({
        data: fieldPayload.values.map((fieldValue) => ({
          projectId,
          definitionId: fieldValue.definitionId,
          value: fieldValue.value,
        })),
      });
    }

    await tx.projectMassType.deleteMany({ where: { projectId } });
    if (massTypePayload.values.length) {
      await tx.projectMassType.createMany({
        data: massTypePayload.values.map((massType) => ({
          projectId,
          massTypeId: massType.massTypeId,
          plannedIn: massType.plannedIn,
          plannedOut: massType.plannedOut,
        })),
      });
    }

    if (body.kpis !== undefined) {
      await tx.projectKpi.deleteMany({ where: { projectId } });
      if (kpiPayload.values.length) {
        await tx.projectKpi.createMany({
          data: kpiPayload.values.map((kpi) => ({
            projectId,
            metric: kpi.metric,
            label: kpi.label,
            targetValue: kpi.targetValue,
            currentValue: kpi.currentValue,
            unit: kpi.unit,
            contractRef: kpi.contractRef,
          })),
        });
      }
    }
  });

  await writeAuditLog({
    customerId: access.project.customerId,
    userId: access.session.user.id,
    action: "project.setup.update",
    entityType: "Project",
    entityId: projectId,
    metadata: {
      fieldValues: fieldPayload.values.length,
      massTypes: massTypePayload.values.length,
      kpis: kpiPayload.values.length,
    },
  });

  return NextResponse.json({ ok: true });
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function optionalDateValue(value: unknown): { value: Date | null; error: string | null } {
  const raw = stringValue(value);
  if (!raw) return { value: null, error: null };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { value: null, error: "Ugyldig dato" };
  return { value: date, error: null };
}

function nullableStringValue(value: unknown): string | null {
  const normalized = stringValue(value);
  return normalized || null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalNumberValue(value: unknown): { value: number | null; error: string | null } {
  if (value === null || value === undefined || value === "") return { value: null, error: null };
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { value: null, error: "Kontraktsstørrelse må være 0 eller høyere." };
  }
  return { value: parsed, error: null };
}

function optionalEnumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): { value: T[number] | null; error: string | null } {
  const normalized = stringValue(value);
  if (!normalized) return { value: null, error: null };
  if ((allowed as readonly string[]).includes(normalized)) return { value: normalized as T[number], error: null };
  return { value: null, error: "Ugyldig valg i prosjektoppsettet." };
}
