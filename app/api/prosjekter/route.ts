import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuthenticatedUser, requireCustomerAccess, writeAuditLog } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import {
  getActiveProjectSetupCatalog,
  listProjectCustomersForUser,
  listProjectsForUser,
  normalizeProjectFieldValues,
  normalizeProjectKpis,
  normalizeProjectMassTypes,
} from "@/lib/projects";

const CONTRACT_TYPES = ["NS_8405", "NS_8406", "NS_8407", "NS_8417", "OTHER"] as const;
const CLIENT_TYPES = ["PUBLIC", "PRIVATE"] as const;
const PROJECT_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const;

export async function GET() {
  const session = await requireAuthenticatedUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [projects, customers] = await Promise.all([
    listProjectsForUser(session.user.id, session.user.role),
    listProjectCustomersForUser(session.user.id, session.user.role),
  ]);

  return NextResponse.json({ projects, customers });
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });

  const customerId = integerValue(body.customerId, 0);
  if (customerId <= 0) {
    return NextResponse.json({ error: "Velg kunde for prosjektet" }, { status: 400 });
  }

  const customerAccess = await requireCustomerAccess(customerId, "admin");
  if (!customerAccess) {
    return NextResponse.json({ error: "Du kan ikke opprette prosjekt for denne kunden" }, { status: 403 });
  }

  const projectNumber = stringValue(body.projectNumber);
  const name = stringValue(body.name);
  if (!projectNumber || !name) {
    return NextResponse.json(
      { error: "Prosjektnummer og navn er påkrevd" },
      { status: 400 },
    );
  }

  const startDate = optionalDateValue(body.startDate);
  const endDate = optionalDateValue(body.endDate);
  if (startDate.error || endDate.error) {
    return NextResponse.json({ error: startDate.error ?? endDate.error }, { status: 400 });
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

  try {
    const project = await prisma.project.create({
      data: {
        projectNumber,
        name,
        description: nullableStringValue(body.description),
        addressLine: nullableStringValue(body.addressLine),
        postalCode: nullableStringValue(body.postalCode),
        city: nullableStringValue(body.city),
        contractType: contractType.value,
        contractSizeNok: contractSizeNok.value,
        clientType: clientType.value,
        clientName: nullableStringValue(body.clientName),
        clientAddress: nullableStringValue(body.clientAddress),
        clientEmail: nullableStringValue(body.clientEmail),
        clientContactName: nullableStringValue(body.clientContactName),
        clientContactEmail: nullableStringValue(body.clientContactEmail),
        clientContactPhone: nullableStringValue(body.clientContactPhone),
        status: projectStatus.value ?? "ACTIVE",
        startDate: startDate.value,
        endDate: endDate.value,
        customer: { connect: { customer_id: customerId } },
        createdBy: { connect: { id: session.user.id } },
        participants: {
          create: {
            user: { connect: { id: session.user.id } },
            role: "OWNER",
          },
        },
        fieldValues: fieldPayload.values.length
          ? {
              create: fieldPayload.values.map((fieldValue) => ({
                definition: { connect: { id: fieldValue.definitionId } },
                value: fieldValue.value,
              })),
            }
          : undefined,
        massTypes: massTypePayload.values.length
          ? {
              create: massTypePayload.values.map((massType) => ({
                massType: { connect: { id: massType.massTypeId } },
                plannedIn: massType.plannedIn,
                plannedOut: massType.plannedOut,
              })),
            }
          : undefined,
        kpis: kpiPayload.values.length
          ? {
              create: kpiPayload.values,
            }
          : undefined,
      },
      select: {
        id: true,
        customerId: true,
        projectNumber: true,
        name: true,
      },
    });

    await writeAuditLog({
      customerId,
      userId: session.user.id,
      action: "project.create",
      entityType: "Project",
      entityId: project.id,
      metadata: {
        projectNumber: project.projectNumber,
        name: project.name,
        kpis: kpiPayload.values.length,
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "Prosjektnummeret finnes allerede for denne kunden" },
        { status: 409 },
      );
    }

    console.error("Failed to create project", error);
    return NextResponse.json({ error: "Kunne ikke opprette prosjekt" }, { status: 500 });
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

function optionalDateValue(value: unknown): { value: Date | null; error: string | null } {
  const raw = stringValue(value);
  if (!raw) return { value: null, error: null };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { value: null, error: "Ugyldig dato" };
  return { value: date, error: null };
}

function integerValue(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
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

function optionalEnumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): { value: T[number] | null; error: string | null } {
  const normalized = stringValue(value);
  if (!normalized) return { value: null, error: null };
  if ((allowed as readonly string[]).includes(normalized)) return { value: normalized as T[number], error: null };
  return { value: null, error: "Ugyldig valg i prosjektoppsettet." };
}
