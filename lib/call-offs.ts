import type { CallOffStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CallOffProjectOption = {
  id: string;
  projectNumber: string;
  name: string;
};

export type CallOffLineItem = {
  id: string;
  description: string;
  quantity: number;
  wantedFrom: string | null;
  wantedTo: string | null;
  projectId: string | null;
  projectLabel: string | null;
  machineNumber: string | null;
  priceText: string | null;
};

export type CallOffListItem = {
  id: string;
  number: string | null;
  frameAgreementRef: string;
  status: CallOffStatus;
  sentAt: string | null;
  lessorSignedAt: string | null;
  lessorSignedBy: string | null;
  customerSignedAt: string | null;
  customerSignedBy: string | null;
  rejectReason: string | null;
  externalRef: string | null;
  pdfDocFileId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  lines: CallOffLineItem[];
};

type NormalizedCallOffLine = {
  description: string;
  quantity: number;
  wantedFrom: Date | null;
  wantedTo: Date | null;
  projectId: string | null;
};

export type ReceiveCallOffReturnPayload = {
  portalCallOffId: string;
  lines: Array<{
    lineId: string;
    machineNumber: string;
    priceText: string;
  }>;
  lessorSignedBy: string;
  lessorSignedAt: string;
};

export function isCallOffIntegrationConfigured() {
  return Boolean(
    process.env.BJUGSTAD_REGISTER_URL?.trim() &&
      process.env.BJUGSTAD_REGISTER_API_KEY?.trim(),
  );
}

export async function listCallOffProjectsForCustomer(
  customerId: number,
): Promise<CallOffProjectOption[]> {
  const projects = await prisma.project.findMany({
    where: {
      customerId,
      status: { not: "ARCHIVED" },
    },
    select: {
      id: true,
      projectNumber: true,
      name: true,
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return projects;
}

export async function listCallOffs(customerId: number): Promise<CallOffListItem[]> {
  const callOffs = await prisma.callOff.findMany({
    where: { customerId },
    include: {
      createdBy: {
        select: {
          name: true,
          email: true,
        },
      },
      lines: {
        include: {
          project: {
            select: {
              projectNumber: true,
              name: true,
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return callOffs.map((callOff) => ({
    id: callOff.id,
    number: callOff.number,
    frameAgreementRef: callOff.frameAgreementRef,
    status: callOff.status,
    sentAt: callOff.sentAt?.toISOString() ?? null,
    lessorSignedAt: callOff.lessorSignedAt?.toISOString() ?? null,
    lessorSignedBy: callOff.lessorSignedBy,
    customerSignedAt: callOff.customerSignedAt?.toISOString() ?? null,
    customerSignedBy: callOff.customerSignedBy,
    rejectReason: callOff.rejectReason,
    externalRef: callOff.externalRef,
    pdfDocFileId: callOff.pdfDocFileId,
    createdByName: callOff.createdBy?.name ?? callOff.createdBy?.email ?? null,
    createdAt: callOff.createdAt.toISOString(),
    updatedAt: callOff.updatedAt.toISOString(),
    lines: callOff.lines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      wantedFrom: line.wantedFrom?.toISOString() ?? null,
      wantedTo: line.wantedTo?.toISOString() ?? null,
      projectId: line.projectId,
      projectLabel: line.project
        ? `${line.project.projectNumber} ${line.project.name}`
        : null,
      machineNumber: line.machineNumber,
      priceText: line.priceText,
    })),
  }));
}

export async function createCallOff(params: {
  customerId: number;
  createdById: string;
  frameAgreementRef: string;
  lines: unknown;
}) {
  const frameAgreementRef = params.frameAgreementRef.trim();
  if (!frameAgreementRef) {
    throw new Error("Rammeavtale/referanse er påkrevd.");
  }

  const normalizedLines = normalizeCallOffLines(params.lines);
  if (normalizedLines.error) throw new Error(normalizedLines.error);

  await assertProjectsBelongToCustomer(
    params.customerId,
    normalizedLines.lines.map((line) => line.projectId).filter(Boolean) as string[],
  );

  return prisma.callOff.create({
    data: {
      customerId: params.customerId,
      frameAgreementRef,
      createdById: params.createdById,
      lines: {
        create: normalizedLines.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          wantedFrom: line.wantedFrom,
          wantedTo: line.wantedTo,
          projectId: line.projectId,
        })),
      },
    },
    select: { id: true },
  });
}

export async function sendCallOffToLessor(callOffId: string, customerId: number) {
  if (!isCallOffIntegrationConfigured()) {
    throw new Error("Integrasjon mot Bjugstad-registeret er ikke konfigurert.");
  }

  const callOff = await prisma.callOff.findFirst({
    where: { id: callOffId, customerId },
    include: { lines: true },
  });

  if (!callOff) throw new Error("Avropet finnes ikke.");
  if (callOff.status !== "DRAFT") {
    throw new Error("Kun avrop med status utkast kan sendes.");
  }

  const number = await nextCallOffNumber(customerId);
  const response = await fetch(
    `${process.env.BJUGSTAD_REGISTER_URL!.replace(/\/$/, "")}/api/avrop`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.BJUGSTAD_REGISTER_API_KEY!,
      },
      body: JSON.stringify({
        portalCallOffId: callOff.id,
        number,
        frameAgreementRef: callOff.frameAgreementRef,
        lines: callOff.lines.map((line) => ({
          lineId: line.id,
          description: line.description,
          quantity: line.quantity,
          wantedFrom: line.wantedFrom?.toISOString() ?? null,
          wantedTo: line.wantedTo?.toISOString() ?? null,
          projectId: line.projectId,
        })),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Kunne ikke sende avropet til Bjugstad-registeret (${response.status}).`);
  }

  const body = await response.json().catch(() => ({}));
  const externalRef =
    isRecord(body) && typeof body.externalRef === "string" ? body.externalRef : null;

  return prisma.callOff.update({
    where: { id: callOff.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      number,
      externalRef,
    },
    select: { id: true },
  });
}

export async function receiveCallOffReturn(payload: ReceiveCallOffReturnPayload) {
  const callOff = await prisma.callOff.findUnique({
    where: { id: payload.portalCallOffId },
    include: {
      lines: {
        select: { id: true },
      },
    },
  });

  if (!callOff) throw new Error("Avropet finnes ikke.");
  if (callOff.status !== "SENT") {
    throw new Error("Kun sendte avrop kan prises av utleier.");
  }

  const lessorSignedAt = new Date(payload.lessorSignedAt);
  if (Number.isNaN(lessorSignedAt.getTime())) {
    throw new Error("Utleiers signeringstidspunkt er ugyldig.");
  }

  const knownLineIds = new Set(callOff.lines.map((line) => line.id));
  for (const line of payload.lines) {
    if (!knownLineIds.has(line.lineId)) {
      throw new Error("Returen inneholder en ukjent avropslinje.");
    }
    if (!line.machineNumber.trim() || !line.priceText.trim()) {
      throw new Error("Maskinnummer og pris må fylles ut for alle linjer.");
    }
  }

  return prisma.$transaction(async (tx) => {
    for (const line of payload.lines) {
      await tx.callOffLine.update({
        where: { id: line.lineId },
        data: {
          machineNumber: line.machineNumber.trim(),
          priceText: line.priceText.trim(),
        },
      });
    }

    return tx.callOff.update({
      where: { id: callOff.id },
      data: {
        status: "PRICED_BY_LESSOR",
        lessorSignedAt,
        lessorSignedBy: payload.lessorSignedBy.trim(),
      },
      select: {
        id: true,
        customerId: true,
      },
    });
  });
}

export async function signCallOff(params: {
  callOffId: string;
  customerId: number;
  signedBy: string;
}) {
  const callOff = await prisma.callOff.findFirst({
    where: { id: params.callOffId, customerId: params.customerId },
  });

  if (!callOff) throw new Error("Avropet finnes ikke.");
  if (callOff.status !== "PRICED_BY_LESSOR") {
    throw new Error("Avropet er ikke klart for kundesignatur.");
  }

  const signedAt = new Date();
  const pdfDocFileId = await archiveSignedCallOffPdfPlaceholder({
    callOffId: callOff.id,
    customerId: callOff.customerId,
    signedBy: params.signedBy,
    signedAt,
  });

  const updated = await prisma.callOff.update({
    where: { id: callOff.id },
    data: {
      status: "ACTIVE",
      customerSignedAt: signedAt,
      customerSignedBy: params.signedBy,
      pdfDocFileId,
    },
    select: {
      id: true,
      externalRef: true,
    },
  });

  await notifyCustomerSignature(updated.externalRef ?? updated.id, params.signedBy, signedAt);

  return updated;
}

export async function rejectCallOff(params: {
  callOffId: string;
  customerId: number;
  reason: string;
}) {
  const reason = params.reason.trim();
  if (!reason) throw new Error("Begrunnelse er påkrevd.");

  const callOff = await prisma.callOff.findFirst({
    where: { id: params.callOffId, customerId: params.customerId },
  });

  if (!callOff) throw new Error("Avropet finnes ikke.");
  if (callOff.status !== "PRICED_BY_LESSOR") {
    throw new Error("Kun prisede avrop kan avslås.");
  }

  return prisma.callOff.update({
    where: { id: callOff.id },
    data: {
      status: "REJECTED",
      rejectReason: reason,
    },
    select: { id: true },
  });
}

export async function cancelCallOff(callOffId: string, customerId: number) {
  const callOff = await prisma.callOff.findFirst({
    where: { id: callOffId, customerId },
  });

  if (!callOff) throw new Error("Avropet finnes ikke.");
  if (callOff.status !== "DRAFT") {
    throw new Error("Kun utkast kan kanselleres.");
  }

  return prisma.callOff.update({
    where: { id: callOff.id },
    data: { status: "CANCELLED" },
    select: { id: true },
  });
}

function normalizeCallOffLines(rawLines: unknown): {
  lines: NormalizedCallOffLine[];
  error: string | null;
} {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return { lines: [], error: "Avropet må ha minst én linje." };
  }

  const lines: NormalizedCallOffLine[] = [];

  for (const rawLine of rawLines) {
    if (!isRecord(rawLine)) continue;

    const description = stringValue(rawLine.description);
    if (!description) return { lines: [], error: "Beskrivelse er påkrevd på alle linjer." };

    const quantity = integerValue(rawLine.quantity, 1);
    if (quantity < 1) return { lines: [], error: "Antall må være minst 1." };

    const wantedFrom = optionalDateValue(rawLine.wantedFrom);
    const wantedTo = optionalDateValue(rawLine.wantedTo);
    if (wantedFrom.error || wantedTo.error) {
      return { lines: [], error: wantedFrom.error ?? wantedTo.error };
    }
    if (wantedFrom.value && wantedTo.value && wantedFrom.value > wantedTo.value) {
      return { lines: [], error: "Fra-dato kan ikke være etter til-dato." };
    }

    lines.push({
      description,
      quantity,
      wantedFrom: wantedFrom.value,
      wantedTo: wantedTo.value,
      projectId: nullableStringValue(rawLine.projectId),
    });
  }

  if (lines.length === 0) return { lines: [], error: "Avropet må ha minst én linje." };
  return { lines, error: null };
}

async function assertProjectsBelongToCustomer(customerId: number, projectIds: string[]) {
  const uniqueProjectIds = [...new Set(projectIds)];
  if (!uniqueProjectIds.length) return;

  const projectCount = await prisma.project.count({
    where: {
      customerId,
      id: { in: uniqueProjectIds },
    },
  });

  if (projectCount !== uniqueProjectIds.length) {
    throw new Error("Ett eller flere prosjekter hører ikke til valgt kunde.");
  }
}

async function nextCallOffNumber(customerId: number) {
  const year = new Date().getFullYear();
  const count = await prisma.callOff.count({
    where: {
      customerId,
      number: { not: null },
    },
  });

  return `AVR-${year}-${String(count + 1).padStart(3, "0")}`;
}

async function notifyCustomerSignature(
  externalRefOrCallOffId: string,
  signedBy: string,
  signedAt: Date,
) {
  if (!isCallOffIntegrationConfigured()) return;

  try {
    await fetch(
      `${process.env.BJUGSTAD_REGISTER_URL!.replace(/\/$/, "")}/api/avrop/${externalRefOrCallOffId}/kundesignatur`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.BJUGSTAD_REGISTER_API_KEY!,
        },
        body: JSON.stringify({
          customerSignedBy: signedBy,
          customerSignedAt: signedAt.toISOString(),
        }),
      },
    );
  } catch (error) {
    console.error("Failed to notify Bjugstad register about call-off signature", error);
  }
}

async function archiveSignedCallOffPdfPlaceholder(_params: {
  callOffId: string;
  customerId: number;
  signedBy: string;
  signedAt: Date;
}) {
  void _params;
  // Phase 3 placeholder:
  // When Azure Blob storage and a PDF renderer are configured, this function
  // should generate the signed avrop PDF, upload it to blob storage, create a
  // DocFile in the locked "Avropsdokumenter" folder, and return that DocFile id.
  // Returning null keeps the workflow usable while making the missing archive
  // step explicit in code and UI.
  return null;
}

function optionalDateValue(value: unknown): { value: Date | null; error: string | null } {
  const raw = stringValue(value);
  if (!raw) return { value: null, error: null };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { value: null, error: "Ugyldig dato i avropslinje." };
  return { value: date, error: null };
}

function integerValue(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
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
