import { z } from "zod";

export const GPS_INGEST_PROVIDERS = ["TELTONIKA", "MICTRACK"] as const;
export const TELEMETRY_PROVIDERS = [
  "BJUGSTAD",
  "CAT",
  "HYDREMA",
  "TRACKUNIT",
  "TELTONIKA",
  "MICTRACK",
  "VOLVO_CE",
  "KOMATSU",
  "SCANIA",
  "VOLVO_TRUCKS",
  "HITACHI",
  "LIEBHERR",
  "JCB",
  "OTHER",
] as const;

const optionalFiniteNumber = (minimum: number, maximum: number) =>
  z.number().finite().min(minimum).max(maximum).optional();

const timestampSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Ugyldig tidspunkt");

export const normalizedGpsRecordSchema = z.object({
  eventId: z.string().trim().min(1).max(200).optional(),
  at: timestampSchema,
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  altitude: optionalFiniteNumber(-1000, 20_000),
  speedKmh: optionalFiniteNumber(0, 400),
  heading: optionalFiniteNumber(0, 360),
  ignition: z.boolean(),
  distanceKm: optionalFiniteNumber(0, Number.MAX_SAFE_INTEGER),
  engineHours: optionalFiniteNumber(0, Number.MAX_SAFE_INTEGER),
  fuelLiters: optionalFiniteNumber(0, Number.MAX_SAFE_INTEGER),
  energyKwh: optionalFiniteNumber(0, Number.MAX_SAFE_INTEGER),
  payloadTonnes: optionalFiniteNumber(0, 10_000),
});

export const normalizedGpsPayloadSchema = z.object({
  version: z.literal(1).optional().default(1),
  provider: z.enum(GPS_INGEST_PROVIDERS).optional(),
  deviceImei: z.string().trim().regex(/^\d{8,20}$/, "IMEI må inneholde 8-20 sifre"),
  records: z.array(normalizedGpsRecordSchema).min(1).max(500),
});

export type NormalizedGpsPayload = z.infer<typeof normalizedGpsPayloadSchema>;
export type NormalizedGpsRecord = z.infer<typeof normalizedGpsRecordSchema>;

export const normalizedTelemetrySnapshotSchema = z
  .object({
    machineId: z.string().trim().min(1).max(100),
    projectId: z.string().trim().min(1).max(100).nullable().optional(),
    provider: z.enum(TELEMETRY_PROVIDERS),
    periodStart: timestampSchema,
    periodEnd: timestampSchema,
    engineHours: optionalFiniteNumber(0, Number.MAX_SAFE_INTEGER),
    idleHours: optionalFiniteNumber(0, Number.MAX_SAFE_INTEGER),
    fuelLiters: optionalFiniteNumber(0, Number.MAX_SAFE_INTEGER),
    energyKwh: optionalFiniteNumber(0, Number.MAX_SAFE_INTEGER),
    distanceKm: optionalFiniteNumber(0, Number.MAX_SAFE_INTEGER),
    payloadTonnes: optionalFiniteNumber(0, Number.MAX_SAFE_INTEGER),
    calculationMethod: z.enum(["PROVIDER", "CALCULATED"]).default("PROVIDER"),
  })
  .refine((value) => Date.parse(value.periodEnd) > Date.parse(value.periodStart), {
    message: "periodEnd må være etter periodStart",
    path: ["periodEnd"],
  })
  .refine(
    (value) =>
      [
        value.engineHours,
        value.idleHours,
        value.fuelLiters,
        value.energyKwh,
        value.distanceKm,
        value.payloadTonnes,
      ].some((measurement) => measurement !== undefined),
    { message: "Snapshot må inneholde minst én måleverdi" },
  );

export type NormalizedTelemetrySnapshot = z.infer<typeof normalizedTelemetrySnapshotSchema>;

export function deriveOperatingStatus(
  ignition: boolean,
  speedKmh: number | undefined,
): "WORKING" | "IDLE" | "OFF" {
  if (!ignition) return "OFF";
  return (speedKmh ?? 0) < 2 ? "IDLE" : "WORKING";
}
