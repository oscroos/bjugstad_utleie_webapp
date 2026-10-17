import { describe, expect, it } from "vitest";
import {
  deriveOperatingStatus,
  normalizedGpsPayloadSchema,
  normalizedTelemetrySnapshotSchema,
} from "../lib/telemetry/contract";

describe("normalized GPS contract", () => {
  it("accepts the documented minimum payload", () => {
    const result = normalizedGpsPayloadSchema.safeParse({
      provider: "TELTONIKA",
      deviceImei: "123456789012345",
      records: [
        {
          eventId: "device-event-1",
          at: "2026-10-17T10:00:00Z",
          lat: 60.123,
          lng: 10.123,
          speedKmh: 1.5,
          ignition: true,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid IMEIs and coordinates", () => {
    const result = normalizedGpsPayloadSchema.safeParse({
      deviceImei: "not-an-imei",
      records: [
        {
          at: "2026-10-17T10:00:00Z",
          lat: 100,
          lng: 10,
          ignition: true,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("caps a request at 500 records", () => {
    const record = {
      at: "2026-10-17T10:00:00Z",
      lat: 60,
      lng: 10,
      ignition: false,
    };
    const result = normalizedGpsPayloadSchema.safeParse({
      deviceImei: "123456789012345",
      records: Array.from({ length: 501 }, () => record),
    });

    expect(result.success).toBe(false);
  });
});

describe("normalized telemetry snapshots", () => {
  it("accepts a period with at least one measurement", () => {
    const result = normalizedTelemetrySnapshotSchema.safeParse({
      machineId: "2013",
      provider: "CAT",
      periodStart: "2026-10-17T00:00:00Z",
      periodEnd: "2026-10-18T00:00:00Z",
      engineHours: 7.5,
    });

    expect(result.success).toBe(true);
  });

  it("rejects empty or backwards periods", () => {
    const result = normalizedTelemetrySnapshotSchema.safeParse({
      machineId: "2013",
      provider: "CAT",
      periodStart: "2026-10-18T00:00:00Z",
      periodEnd: "2026-10-17T00:00:00Z",
    });

    expect(result.success).toBe(false);
  });
});

describe("operating status", () => {
  it("marks ignition-off observations as off", () => {
    expect(deriveOperatingStatus(false, 30)).toBe("OFF");
  });

  it("uses the client-defined 2 km/h idle threshold", () => {
    expect(deriveOperatingStatus(true, 1.99)).toBe("IDLE");
    expect(deriveOperatingStatus(true, 2)).toBe("WORKING");
  });
});
