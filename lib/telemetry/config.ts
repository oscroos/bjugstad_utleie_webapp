import { timingSafeEqual } from "node:crypto";

export type GpsIngestionConfig =
  | { enabled: true; secret: string }
  | { enabled: false; reason: "disabled" | "missing_secret" };

export function getGpsIngestionConfig(): GpsIngestionConfig {
  const enabled = ["1", "true", "yes"].includes(
    process.env.GPS_INGEST_ENABLED?.trim().toLowerCase() ?? "",
  );

  if (!enabled) return { enabled: false, reason: "disabled" };

  const secret = process.env.GPS_INGEST_SECRET?.trim();
  if (!secret) return { enabled: false, reason: "missing_secret" };

  return { enabled: true, secret };
}

export function secretsMatch(received: string | null, expected: string): boolean {
  if (!received) return false;

  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (receivedBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}
