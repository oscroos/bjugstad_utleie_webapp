import { NextResponse } from "next/server";
import { normalizedGpsPayloadSchema } from "@/lib/telemetry/contract";
import { getGpsIngestionConfig, secretsMatch } from "@/lib/telemetry/config";
import {
  ingestNormalizedGpsPayload,
  maskDeviceIdentifier,
} from "@/lib/telemetry/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 1_000_000;

export async function POST(request: Request) {
  const config = getGpsIngestionConfig();
  if (!config.enabled) {
    return NextResponse.json(
      { error: "GPS-mottak er ikke konfigurert", code: config.reason },
      { status: 503 },
    );
  }

  if (!secretsMatch(request.headers.get("x-ingest-secret"), config.secret)) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Payload er for stor" }, { status: 413 });
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Payload er for stor" }, { status: 413 });
    }
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });
  }

  const parsed = normalizedGpsPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Ugyldig GPS-payload",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const result = await ingestNormalizedGpsPayload(parsed.data);

    if (result.status === "unknown_device") {
      console.warn("[gps-ingest] Unknown device", {
        provider: parsed.data.provider ?? "unspecified",
        device: maskDeviceIdentifier(parsed.data.deviceImei),
        records: parsed.data.records.length,
      });
      return NextResponse.json({ error: "Ukjent enhet", code: result.status }, { status: 404 });
    }

    if (result.status === "ambiguous_device") {
      console.error("[gps-ingest] Ambiguous active device mapping", {
        device: maskDeviceIdentifier(parsed.data.deviceImei),
      });
      return NextResponse.json(
        { error: "Enheten har flere aktive koblinger", code: result.status },
        { status: 409 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[gps-ingest] Failed to persist payload", error);
    return NextResponse.json({ error: "Kunne ikke lagre GPS-data" }, { status: 500 });
  }
}
