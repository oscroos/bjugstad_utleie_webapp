import { NextResponse } from "next/server";
import { receiveCallOffReturn, type ReceiveCallOffReturnPayload } from "@/lib/call-offs";
import { writeAuditLog } from "@/lib/access";

export async function POST(request: Request) {
  const configuredSecret = process.env.AVROP_WEBHOOK_SECRET?.trim();
  if (!configuredSecret) {
    return NextResponse.json(
      {
        error: "Avrop-retur webhook er ikke konfigurert.",
        details: "Sett AVROP_WEBHOOK_SECRET før Bjugstad-registeret kan sende retur til portalen.",
      },
      { status: 503 },
    );
  }

  const providedSecret = request.headers.get("x-ingest-secret")?.trim();
  if (!providedSecret || providedSecret !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonObject(request);
  const payload = normalizePayload(body);
  if (!payload.value) return NextResponse.json({ error: payload.error }, { status: 400 });

  try {
    const callOff = await receiveCallOffReturn(payload.value);

    await writeAuditLog({
      customerId: callOff.customerId,
      action: "call_off.lessor_return",
      entityType: "CallOff",
      entityId: callOff.id,
      metadata: {
        source: "Bjugstad-registeret",
        lineCount: payload.value.lines.length,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to receive call-off return", error);
    return NextResponse.json({ error: "Kunne ikke motta avropsretur" }, { status: 500 });
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

function normalizePayload(
  body: Record<string, unknown> | null,
): { value: ReceiveCallOffReturnPayload; error: null } | { value: null; error: string } {
  if (!body) return { value: null, error: "Ugyldig JSON payload" };

  const portalCallOffId = stringValue(body.portalCallOffId);
  const lessorSignedBy = stringValue(body.lessorSignedBy);
  const lessorSignedAt = stringValue(body.lessorSignedAt);
  const rawLines = Array.isArray(body.lines) ? body.lines : [];

  if (!portalCallOffId || !lessorSignedBy || !lessorSignedAt || rawLines.length === 0) {
    return { value: null, error: "Retur mangler avrop, signatur eller linjer." };
  }

  const lines = rawLines.flatMap((rawLine) => {
    if (!isRecord(rawLine)) return [];
    const lineId = stringValue(rawLine.lineId);
    const machineNumber = stringValue(rawLine.machineNumber);
    const priceText = stringValue(rawLine.priceText);
    return lineId && machineNumber && priceText
      ? [{ lineId, machineNumber, priceText }]
      : [];
  });

  if (lines.length !== rawLines.length) {
    return { value: null, error: "Alle returlinjer må ha linje-ID, maskinnummer og pris." };
  }

  return {
    value: {
      portalCallOffId,
      lessorSignedBy,
      lessorSignedAt,
      lines,
    },
    error: null,
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
