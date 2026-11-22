import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMachines: vi.fn(),
  fetchAgreementsForCustomer: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    machine: { findMany: mocks.findMachines },
  },
}));

import { splitAgreementsByStatus } from "@/lib/agreements";
import { listProjectMachines } from "@/lib/projects";
import {
  buildTestAgreements,
  loadTestAgreements,
  TEST_CUSTOMER_ID,
  type TestMachine,
} from "@/lib/test-agreements";

function machines(count: number): TestMachine[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(100 + index),
    name: `Maskin ${100 + index}`,
    make: "Volvo",
  }));
}

describe("demo agreements for the test customer", () => {
  it("spreads the machines over the test projects without reusing one", () => {
    const agreements = buildTestAgreements(machines(7));

    expect(agreements.map((agreement) => [agreement.id, agreement.projectNumber, agreement.machines?.length])).toEqual([
      ["TEST-A-1001", "TEST-001", 3],
      ["TEST-A-1002", "TEST-001", 1],
      ["TEST-A-1003", "TEST-001", 1],
      ["TEST-A-2001", "TEST-002", 2],
    ]);

    const ids = agreements.flatMap((agreement) => agreement.machines?.map((machine) => machine.id) ?? []);
    expect(new Set(ids).size).toBe(7);
    expect(agreements.every((agreement) => agreement.customerId === TEST_CUSTOMER_ID)).toBe(true);
  });

  it("covers running, ended and not-yet-started agreements", () => {
    const now = new Date();
    const agreements = buildTestAgreements(machines(7), now);
    const { active, historical } = splitAgreementsByStatus(agreements);

    expect(historical.map((agreement) => agreement.id)).toEqual(["TEST-A-1003"]);
    expect(active.map((agreement) => agreement.id)).toEqual(["TEST-A-1001", "TEST-A-1002", "TEST-A-2001"]);

    const openEnded = agreements.find((agreement) => agreement.id === "TEST-A-1001");
    expect(openEnded?.endDate).toBeNull();

    const notStarted = agreements.find((agreement) => agreement.id === "TEST-A-2001");
    expect(new Date(notStarted?.startDate ?? "").getTime()).toBeGreaterThan(now.getTime());
  });

  it("drops agreements that are left without a machine", () => {
    const agreements = buildTestAgreements(machines(2));

    expect(agreements).toHaveLength(1);
    expect(agreements[0].machines).toHaveLength(2);
    expect(buildTestAgreements([])).toEqual([]);
  });

  it("uses only machines with a numeric register id and tops up when few have a position", async () => {
    mocks.findMachines
      .mockResolvedValueOnce([
        { id: "12", name: " Volvo EC300E 12 ", oemName: "Volvo" },
        { id: "CAT-9", name: "Ikke i registeret", oemName: "CAT" },
      ])
      .mockResolvedValueOnce([
        { id: "12", name: " Volvo EC300E 12 ", oemName: "Volvo" },
        { id: "13", name: null, oemName: "N/A" },
      ]);

    const agreements = await loadTestAgreements();

    expect(mocks.findMachines).toHaveBeenCalledTimes(2);
    expect(agreements).toHaveLength(1);
    expect(agreements[0].machines).toEqual([
      { id: "12", name: "Volvo EC300E 12", make: "Volvo" },
      { id: "13", name: "Maskin 13", make: null },
    ]);
  });
});

describe("machines on a test project", () => {
  const testProject = { customerId: TEST_CUSTOMER_ID, projectNumber: "TEST-001" };
  const dbMachines = machines(7).map((machine) => ({ id: machine.id, name: machine.name, oemName: machine.make }));

  it("lists the demo machines for a super admin", async () => {
    mocks.findMachines.mockResolvedValue(dbMachines);

    const result = await listProjectMachines(testProject, "super_admin");

    expect(result.error).toBeNull();
    expect(result.machines).toHaveLength(5);
    expect(result.machines.filter((entry) => entry.isActive)).toHaveLength(4);
    // Active agreements are listed first; the ended one comes last.
    expect(result.machines[4].agreement.id).toBe("TEST-A-1003");
  });

  it("gives other roles nothing and does not read the machines table", async () => {
    const result = await listProjectMachines(testProject, "customer");

    expect(result).toEqual({ machines: [], error: null });
    expect(mocks.findMachines).not.toHaveBeenCalled();
  });

  it("leaves the project without agreements empty", async () => {
    mocks.findMachines.mockResolvedValue(dbMachines);

    const result = await listProjectMachines({ customerId: TEST_CUSTOMER_ID, projectNumber: "TEST-003" }, "super_admin");

    expect(result).toEqual({ machines: [], error: null });
  });
});
