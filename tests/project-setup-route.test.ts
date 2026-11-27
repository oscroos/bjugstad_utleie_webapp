import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireProjectRole: vi.fn(),
  writeAuditLog: vi.fn(),
  loadProjectSnapshot: vi.fn(),
  updateProject: vi.fn(),
  deleteFieldValues: vi.fn(),
  createFieldValues: vi.fn(),
  deleteMassTypes: vi.fn(),
  createMassTypes: vi.fn(),
  deleteKpis: vi.fn(),
  createKpis: vi.fn(),
  findFieldDefinitions: vi.fn(),
  findMassTypes: vi.fn(),
}));

vi.mock("@/lib/access", () => ({
  requireProjectRole: mocks.requireProjectRole,
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("@/lib/project-audit", () => ({ loadProjectSnapshot: mocks.loadProjectSnapshot }));

vi.mock("@/lib/prisma", () => {
  const tx = {
    project: { update: mocks.updateProject },
    projectFieldValue: { deleteMany: mocks.deleteFieldValues, createMany: mocks.createFieldValues },
    projectMassType: { deleteMany: mocks.deleteMassTypes, createMany: mocks.createMassTypes },
    projectKpi: { deleteMany: mocks.deleteKpis, createMany: mocks.createKpis },
  };
  return {
    prisma: {
      $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
      projectFieldDefinition: { findMany: mocks.findFieldDefinitions },
      massTypeCatalog: { findMany: mocks.findMassTypes },
    },
  };
});

import { PUT } from "@/app/api/prosjekter/[projectId]/oppsett/route";

function put(body: unknown) {
  mocks.requireProjectRole.mockResolvedValue({
    session: { user: { id: "u1" } },
    project: { id: "p1", customerId: 42, projectNumber: "P-1", name: "Prosjekt" },
    role: "OWNER",
  });
  mocks.loadProjectSnapshot.mockResolvedValue({ Prosjektnavn: "Prosjekt" });
  mocks.findFieldDefinitions.mockResolvedValue([]);
  mocks.findMassTypes.mockResolvedValue([
    { id: "m1", name: "Stein", unit: "m3", defaultClassification: "UNKNOWN", tonnPerM3: 1.6, swellFactor: 1, active: true, sortOrder: 0 },
  ]);
  return PUT(
    new Request("http://localhost/api/prosjekter/p1/oppsett", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ projectId: "p1" }) },
  );
}

describe("saving a project", () => {
  it("saving one box leaves custom fields, the mass plan and the contract goals untouched", async () => {
    const response = await put({ description: "Ny beskrivelse", clientName: "", endDate: "2027-12-20" });

    expect(response.status).toBe(200);
    expect(mocks.updateProject).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: expect.objectContaining({
        description: "Ny beskrivelse",
        clientName: null,
        endDate: new Date("2027-12-20"),
        // Not in the request, so not changed.
        name: undefined,
        status: undefined,
        contractSizeNok: undefined,
      }),
    });
    expect(mocks.deleteFieldValues).not.toHaveBeenCalled();
    expect(mocks.deleteMassTypes).not.toHaveBeenCalled();
    expect(mocks.deleteKpis).not.toHaveBeenCalled();
    // The catalogues are only needed when those parts are saved.
    expect(mocks.findFieldDefinitions).not.toHaveBeenCalled();
    expect(mocks.findMassTypes).not.toHaveBeenCalled();
  });

  it("the full form still replaces each part it sends", async () => {
    const response = await put({
      name: "Prosjekt",
      fieldValues: [],
      massTypes: [{ massTypeId: "m1", plannedIn: "10", plannedOut: "5" }],
      kpis: [],
    });

    expect(response.status).toBe(200);
    expect(mocks.deleteFieldValues).toHaveBeenCalledWith({ where: { projectId: "p1" } });
    expect(mocks.deleteMassTypes).toHaveBeenCalledWith({ where: { projectId: "p1" } });
    expect(mocks.createMassTypes).toHaveBeenCalledWith({
      data: [{ projectId: "p1", massTypeId: "m1", plannedIn: 10, plannedOut: 5 }],
    });
    expect(mocks.deleteKpis).toHaveBeenCalledWith({ where: { projectId: "p1" } });
  });

  it("an empty mass plan in the request clears it, a missing one does not", async () => {
    await put({ massTypes: [] });
    expect(mocks.deleteMassTypes).toHaveBeenCalledTimes(1);
    expect(mocks.createMassTypes).not.toHaveBeenCalled();
    expect(mocks.deleteFieldValues).not.toHaveBeenCalled();
  });
});
