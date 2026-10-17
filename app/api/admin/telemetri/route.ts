import { NextResponse } from "next/server";
import { Prisma, TelemetryProvider } from "@prisma/client";
import { z } from "zod";
import { requireSuperAdmin, writeAuditLog } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { maskDeviceIdentifier } from "@/lib/telemetry/ingest";

const createSchema = z.object({
  machineId: z.string().trim().min(1).max(100),
  provider: z.nativeEnum(TelemetryProvider),
  externalId: z.string().trim().min(1).max(200),
});

const updateSchema = z
  .object({
    id: z.string().trim().min(1),
    machineId: z.string().trim().min(1).max(100).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => value.machineId !== undefined || value.active !== undefined, {
    message: "Ingen endringer oppgitt",
  });

const deleteSchema = z.object({
  id: z.string().trim().min(1),
});

const linkInclude = {
  machine: {
    select: {
      id: true,
      name: true,
      oemName: true,
      serialNumber: true,
    },
  },
  _count: {
    select: {
      positionHistory: true,
    },
  },
} satisfies Prisma.MachineTelemetryLinkInclude;

export async function GET() {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const [links, machines] = await Promise.all([
    prisma.machineTelemetryLink.findMany({
      include: linkInclude,
      orderBy: [{ active: "desc" }, { provider: "asc" }, { updatedAt: "desc" }],
    }),
    prisma.machine.findMany({
      select: { id: true, name: true, oemName: true, serialNumber: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
  ]);

  return NextResponse.json({ links, machines });
}

export async function POST(request: Request) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const externalIdError = validateExternalId(parsed.data.provider, parsed.data.externalId);
  if (externalIdError) {
    return NextResponse.json({ error: externalIdError }, { status: 400 });
  }

  const machine = await prisma.machine.findUnique({
    where: { id: parsed.data.machineId },
    select: { id: true },
  });
  if (!machine) return NextResponse.json({ error: "Maskinen finnes ikke" }, { status: 404 });

  try {
    const link = await prisma.machineTelemetryLink.create({
      data: parsed.data,
      include: linkInclude,
    });
    await writeAuditLog({
      userId: session.user.id,
      action: "admin.telemetry_link.create",
      entityType: "MachineTelemetryLink",
      entityId: link.id,
      metadata: {
        machineId: link.machineId,
        provider: link.provider,
        externalId: maskDeviceIdentifier(link.externalId),
      },
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { error: "Denne leverandør-ID-en er allerede registrert" },
        { status: 409 },
      );
    }
    console.error("Failed to create telemetry link", error);
    return NextResponse.json({ error: "Kunne ikke registrere enheten" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const parsed = updateSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  if (parsed.data.machineId) {
    const machine = await prisma.machine.findUnique({
      where: { id: parsed.data.machineId },
      select: { id: true },
    });
    if (!machine) return NextResponse.json({ error: "Maskinen finnes ikke" }, { status: 404 });
  }

  try {
    const link = await prisma.machineTelemetryLink.update({
      where: { id: parsed.data.id },
      data: {
        machineId: parsed.data.machineId,
        active: parsed.data.active,
      },
      include: linkInclude,
    });
    await writeAuditLog({
      userId: session.user.id,
      action: "admin.telemetry_link.update",
      entityType: "MachineTelemetryLink",
      entityId: link.id,
      metadata: {
        machineId: link.machineId,
        provider: link.provider,
        active: link.active,
      },
    });
    return NextResponse.json({ link });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      return NextResponse.json({ error: "Enhetskoblingen finnes ikke" }, { status: 404 });
    }
    console.error("Failed to update telemetry link", error);
    return NextResponse.json({ error: "Kunne ikke oppdatere enheten" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const parsed = deleteSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const link = await tx.machineTelemetryLink.findUnique({
        where: { id: parsed.data.id },
        select: {
          id: true,
          machineId: true,
          provider: true,
          externalId: true,
          lastSeenAt: true,
          lastSyncAt: true,
          _count: { select: { positionHistory: true } },
        },
      });

      if (!link) return { status: "not_found" as const };
      if (link.lastSeenAt || link.lastSyncAt || link._count.positionHistory > 0) {
        return { status: "has_data" as const };
      }

      await tx.machineTelemetryLink.delete({ where: { id: link.id } });
      return { status: "deleted" as const, link };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.status === "not_found") {
      return NextResponse.json({ error: "Enhetskoblingen finnes ikke" }, { status: 404 });
    }
    if (result.status === "has_data") {
      return NextResponse.json(
        { error: "Koblingen har mottatt eller synkronisert data og kan bare deaktiveres" },
        { status: 409 },
      );
    }

    await writeAuditLog({
      userId: session.user.id,
      action: "admin.telemetry_link.delete",
      entityType: "MachineTelemetryLink",
      entityId: result.link.id,
      metadata: {
        machineId: result.link.machineId,
        provider: result.link.provider,
        externalId: maskDeviceIdentifier(result.link.externalId),
      },
    });
    return NextResponse.json({ deleted: true, id: result.link.id });
  } catch (error) {
    if (isTransactionConflictError(error)) {
      return NextResponse.json(
        { error: "Koblingen ble endret samtidig. Oppdater siden og prøv igjen." },
        { status: 409 },
      );
    }
    console.error("Failed to delete telemetry link", error);
    return NextResponse.json({ error: "Kunne ikke slette enhetskoblingen" }, { status: 500 });
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function validationError(error: z.ZodError) {
  return NextResponse.json(
    { error: error.issues[0]?.message ?? "Ugyldig payload" },
    { status: 400 },
  );
}

function validateExternalId(provider: TelemetryProvider, externalId: string): string | null {
  if (
    (provider === TelemetryProvider.TELTONIKA || provider === TelemetryProvider.MICTRACK) &&
    !/^\d{8,20}$/.test(externalId)
  ) {
    return "IMEI må inneholde 8-20 sifre";
  }
  return null;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isRecordNotFoundError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function isTransactionConflictError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}
