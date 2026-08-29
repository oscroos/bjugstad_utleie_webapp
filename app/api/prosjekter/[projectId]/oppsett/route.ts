import { NextResponse } from "next/server";
import { requireProjectRole, writeAuditLog } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import {
  getActiveProjectSetupCatalog,
  normalizeProjectFieldValues,
  normalizeProjectMassTypes,
} from "@/lib/projects";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

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

  const { fieldDefinitions, massTypes } = await getActiveProjectSetupCatalog();
  const fieldPayload = normalizeProjectFieldValues(fieldDefinitions, body.fieldValues);
  if (fieldPayload.error) return NextResponse.json({ error: fieldPayload.error }, { status: 400 });

  const massTypePayload = normalizeProjectMassTypes(massTypes, body.massTypes);
  if (massTypePayload.error) {
    return NextResponse.json({ error: massTypePayload.error }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: {
        name: body.name !== undefined ? stringValue(body.name) : undefined,
        description: body.description !== undefined ? nullableStringValue(body.description) : undefined,
        addressLine: body.addressLine !== undefined ? nullableStringValue(body.addressLine) : undefined,
        postalCode: body.postalCode !== undefined ? nullableStringValue(body.postalCode) : undefined,
        city: body.city !== undefined ? nullableStringValue(body.city) : undefined,
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
