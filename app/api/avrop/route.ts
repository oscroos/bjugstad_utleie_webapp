import { NextResponse } from "next/server";
import { requireAuthenticatedUser, requireCustomerAccess, writeAuditLog } from "@/lib/access";
import {
  cancelCallOff,
  createCallOff,
  isCallOffIntegrationConfigured,
  listCallOffProjectsForCustomer,
  listCallOffs,
  rejectCallOff,
  sendCallOffToLessor,
  signCallOff,
} from "@/lib/call-offs";
import { listDocumentCustomersForUser } from "@/lib/documents";

export async function GET(request: Request) {
  const session = await requireAuthenticatedUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const customers = await listDocumentCustomersForUser(session.user.id, session.user.role);
  if (customers.length === 0) {
    return NextResponse.json({
      activeCustomerId: null,
      customers,
      projects: [],
      callOffs: [],
      integrationConfigured: isCallOffIntegrationConfigured(),
    });
  }

  const requestedCustomerId = integerValue(
    new URL(request.url).searchParams.get("customerId"),
    0,
  );
  const activeCustomerId = requestedCustomerId || customers[0].id;
  const access = await requireCustomerAccess(activeCustomerId, "user");
  if (!access) return NextResponse.json({ error: "Du har ikke tilgang til valgt kunde" }, { status: 403 });

  const [projects, callOffs] = await Promise.all([
    listCallOffProjectsForCustomer(activeCustomerId),
    listCallOffs(activeCustomerId),
  ]);

  return NextResponse.json({
    activeCustomerId,
    customers,
    projects,
    callOffs,
    integrationConfigured: isCallOffIntegrationConfigured(),
  });
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });

  const customerId = integerValue(body.customerId, 0);
  if (customerId <= 0) return NextResponse.json({ error: "Velg kunde" }, { status: 400 });

  const access = await requireCustomerAccess(customerId, "user");
  if (!access) return NextResponse.json({ error: "Du har ikke tilgang til valgt kunde" }, { status: 403 });

  try {
    const callOff = await createCallOff({
      customerId,
      createdById: session.user.id,
      frameAgreementRef: stringValue(body.frameAgreementRef),
      lines: body.lines,
    });

    await writeAuditLog({
      customerId,
      userId: session.user.id,
      action: "call_off.create",
      entityType: "CallOff",
      entityId: callOff.id,
    });

    return NextResponse.json({ callOff }, { status: 201 });
  } catch (error) {
    return handleKnownError(error, "Kunne ikke opprette avrop");
  }
}

export async function PATCH(request: Request) {
  const session = await requireAuthenticatedUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });

  const customerId = integerValue(body.customerId, 0);
  const callOffId = stringValue(body.callOffId);
  const action = stringValue(body.action);

  if (customerId <= 0 || !callOffId || !action) {
    return NextResponse.json({ error: "Kunde, avrop og handling er påkrevd" }, { status: 400 });
  }

  const access = await requireCustomerAccess(customerId, "user");
  if (!access) return NextResponse.json({ error: "Du har ikke tilgang til valgt kunde" }, { status: 403 });

  try {
    if (action === "send") {
      const status = isCallOffIntegrationConfigured() ? 200 : 501;
      const result = await sendCallOffToLessor(callOffId, customerId);

      await writeAuditLog({
        customerId,
        userId: session.user.id,
        action: "call_off.send",
        entityType: "CallOff",
        entityId: callOffId,
      });

      return NextResponse.json({ callOff: result }, { status });
    }

    if (action === "sign") {
      const signedBy = session.user.name ?? session.user.email ?? "Kunde";
      const result = await signCallOff({ callOffId, customerId, signedBy });

      await writeAuditLog({
        customerId,
        userId: session.user.id,
        action: "call_off.sign",
        entityType: "CallOff",
        entityId: callOffId,
        metadata: {
          pdfArchive:
            "PDF-generering og arkivering i Avropsdokumenter er Phase 3-placeholder frem til Azure/PDF er konfigurert.",
        },
      });

      return NextResponse.json({ callOff: result });
    }

    if (action === "reject") {
      const result = await rejectCallOff({
        callOffId,
        customerId,
        reason: stringValue(body.reason),
      });

      await writeAuditLog({
        customerId,
        userId: session.user.id,
        action: "call_off.reject",
        entityType: "CallOff",
        entityId: callOffId,
      });

      return NextResponse.json({ callOff: result });
    }

    if (action === "cancel") {
      const result = await cancelCallOff(callOffId, customerId);

      await writeAuditLog({
        customerId,
        userId: session.user.id,
        action: "call_off.cancel",
        entityType: "CallOff",
        entityId: callOffId,
      });

      return NextResponse.json({ callOff: result });
    }

    return NextResponse.json({ error: "Ukjent avropshandling" }, { status: 400 });
  } catch (error) {
    if (
      action === "send" &&
      error instanceof Error &&
      error.message.includes("ikke konfigurert")
    ) {
      return NextResponse.json(
        {
          error: error.message,
          details:
            "Sett BJUGSTAD_REGISTER_URL og BJUGSTAD_REGISTER_API_KEY før avrop kan sendes til utleiers register.",
        },
        { status: 501 },
      );
    }

    return handleKnownError(error, "Kunne ikke oppdatere avrop");
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

function handleKnownError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function integerValue(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
