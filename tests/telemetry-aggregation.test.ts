import { describe, expect, it } from "vitest";
import { aggregateStatusDurations } from "../lib/telemetry/aggregation";

describe("telemetry duration aggregation", () => {
  it("aggregates engine and idle duration from consecutive observations", () => {
    const result = aggregateStatusDurations(
      [
        { reportedAt: new Date("2026-10-17T08:00:00Z"), operatingStatus: "WORKING" },
        { reportedAt: new Date("2026-10-17T08:30:00Z"), operatingStatus: "IDLE" },
        { reportedAt: new Date("2026-10-17T09:00:00Z"), operatingStatus: "OFF" },
      ],
      60,
    );

    expect(result.engineHours).toBe(1);
    expect(result.idleHours).toBe(0.5);
    expect(result.ignoredGapHours).toBe(0);
  });

  it("does not invent operating time across gaps above the configured limit", () => {
    const result = aggregateStatusDurations(
      [
        { reportedAt: new Date("2026-10-17T08:00:00Z"), operatingStatus: "IDLE" },
        { reportedAt: new Date("2026-10-17T12:00:00Z"), operatingStatus: "OFF" },
      ],
      30,
    );

    expect(result.engineHours).toBe(0);
    expect(result.idleHours).toBe(0);
    expect(result.ignoredGapHours).toBe(4);
  });

  it("requires an explicit positive gap rule", () => {
    expect(() => aggregateStatusDurations([], 0)).toThrow();
  });
});
