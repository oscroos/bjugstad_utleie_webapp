import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findLinks: vi.fn(),
  createPositions: vi.fn(),
  updateMachine: vi.fn(),
  updateLink: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    machineTelemetryLink: {
      findMany: mocks.findLinks,
    },
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        machinePositionHistory: { createMany: mocks.createPositions },
        machine: { updateMany: mocks.updateMachine },
        machineTelemetryLink: { update: mocks.updateLink },
      }),
  },
}));

import { normalizedGpsPayloadSchema } from "@/lib/telemetry/contract";
import { ingestNormalizedGpsPayload } from "@/lib/telemetry/ingest";

describe("normalized GPS persistence", () => {
  beforeEach(() => {
    mocks.findLinks.mockReset();
    mocks.createPositions.mockReset();
    mocks.updateMachine.mockReset();
    mocks.updateLink.mockReset();
  });

  it("returns a controlled result for an unknown IMEI", async () => {
    mocks.findLinks.mockResolvedValue([]);
    const result = await ingestNormalizedGpsPayload(payload());

    expect(result).toEqual({ status: "unknown_device", received: 1 });
    expect(mocks.createPositions).not.toHaveBeenCalled();
  });

  it("stores observations and updates the latest machine state", async () => {
    mocks.findLinks.mockResolvedValue([
      {
        id: "link-1",
        machineId: "machine-1",
        provider: "TELTONIKA",
        lastSeenAt: null,
      },
    ]);
    mocks.createPositions.mockResolvedValue({ count: 1 });
    mocks.updateMachine.mockResolvedValue({ count: 1 });
    mocks.updateLink.mockResolvedValue({});

    const result = await ingestNormalizedGpsPayload(payload());

    expect(result).toMatchObject({
      status: "stored",
      machineId: "machine-1",
      provider: "TELTONIKA",
      stored: 1,
      duplicates: 0,
      latestPositionUpdated: true,
      projectAssignment: "not_configured",
      zoneEvaluation: "project_not_assigned",
    });
    expect(mocks.createPositions).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [
          expect.objectContaining({
            machineId: "machine-1",
            source: "teltonika",
            ignition: true,
            operatingStatus: "IDLE",
          }),
        ],
      }),
    );
    expect(mocks.updateMachine).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ignition: true,
          operatingStatus: "IDLE",
          lastPositionSource: "teltonika",
        }),
      }),
    );
  });

  it("derives a stable event identity when the provider omits one", async () => {
    mocks.findLinks.mockResolvedValue([
      {
        id: "link-1",
        machineId: "machine-1",
        provider: "TELTONIKA",
        lastSeenAt: null,
      },
    ]);
    mocks.createPositions.mockResolvedValue({ count: 1 });
    mocks.updateMachine.mockResolvedValue({ count: 0 });
    mocks.updateLink.mockResolvedValue({});

    const input = payload();
    delete input.records[0].eventId;
    await ingestNormalizedGpsPayload(input);

    expect(mocks.createPositions).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            providerEventId: expect.stringMatching(/^derived:[a-f0-9]{64}$/),
          }),
        ],
      }),
    );
  });
});

function payload() {
  return normalizedGpsPayloadSchema.parse({
    provider: "TELTONIKA",
    deviceImei: "123456789012345",
    records: [
      {
        eventId: "event-1",
        at: "2026-10-17T10:00:00Z",
        lat: 60.123,
        lng: 10.123,
        speedKmh: 1.5,
        ignition: true,
      },
    ],
  });
}
