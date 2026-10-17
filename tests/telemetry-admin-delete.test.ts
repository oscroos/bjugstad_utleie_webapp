import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  writeAuditLog: vi.fn(),
  findLink: vi.fn(),
  deleteLink: vi.fn(),
}));

vi.mock("@/lib/access", () => ({
  requireSuperAdmin: mocks.requireSuperAdmin,
  writeAuditLog: mocks.writeAuditLog,
}));
vi.mock("@/lib/telemetry/ingest", () => ({
  maskDeviceIdentifier: (value: string) => `masked-${value.slice(-4)}`,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (callback: (tx: unknown) => unknown) => callback({
      machineTelemetryLink: {
        findUnique: mocks.findLink,
        delete: mocks.deleteLink,
      },
    }),
  },
}));

import { DELETE } from "@/app/api/admin/telemetri/route";

describe("telemetry link deletion", () => {
  beforeEach(() => {
    mocks.requireSuperAdmin.mockReset();
    mocks.writeAuditLog.mockReset();
    mocks.findLink.mockReset();
    mocks.deleteLink.mockReset();
    mocks.requireSuperAdmin.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.writeAuditLog.mockResolvedValue(undefined);
  });

  it("deletes and audits an unused link", async () => {
    mocks.findLink.mockResolvedValue({
      id: "link-1",
      machineId: "machine-1",
      provider: "TELTONIKA",
      externalId: "123456789012345",
      lastSeenAt: null,
      lastSyncAt: null,
      _count: { positionHistory: 0 },
    });
    mocks.deleteLink.mockResolvedValue({});

    const response = await DELETE(deleteRequest("link-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true, id: "link-1" });
    expect(mocks.deleteLink).toHaveBeenCalledWith({ where: { id: "link-1" } });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-1",
        action: "admin.telemetry_link.delete",
        entityId: "link-1",
      }),
    );
  });

  it("rejects deletion after telemetry activity", async () => {
    mocks.findLink.mockResolvedValue({
      id: "link-1",
      machineId: "machine-1",
      provider: "TELTONIKA",
      externalId: "123456789012345",
      lastSeenAt: new Date("2026-10-17T10:00:00Z"),
      lastSyncAt: new Date("2026-10-17T10:00:01Z"),
      _count: { positionHistory: 1 },
    });

    const response = await DELETE(deleteRequest("link-1"));

    expect(response.status).toBe(409);
    expect(mocks.deleteLink).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });
});

function deleteRequest(id: string) {
  return new Request("http://localhost/api/admin/telemetri", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
}
