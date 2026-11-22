import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { toAuditActivity, toLoginActivity } from "@/lib/activity";
import {
  auditDate,
  auditNumber,
  describeAuditAction,
  diffSnapshots,
  diffZones,
  parseAuditChanges,
  type AuditZone,
} from "@/lib/audit";
import { buildProjectSnapshot, type ProjectAuditSource } from "@/lib/project-audit";

function project(overrides: Partial<ProjectAuditSource> = {}): ProjectAuditSource {
  return {
    name: "Bjørvika Felt B4",
    description: null,
    addressLine: "Dronning Eufemias gate 30",
    postalCode: "0191",
    city: "Oslo",
    contractType: "NS_8407",
    contractSizeNok: 84_500_000,
    clientType: "PUBLIC",
    clientName: "Demo Byggherre KF",
    clientAddress: null,
    clientEmail: null,
    clientContactName: null,
    clientContactEmail: null,
    clientContactPhone: null,
    status: "PLANNING",
    startDate: new Date("2026-03-02"),
    endDate: null,
    fieldValues: [{ value: "true", definition: { label: "Miljøsertifisert", fieldType: "BOOLEAN" } }],
    massTypes: [{ plannedIn: 1200, plannedOut: 12500, massType: { name: "Stein", unit: "m3" } }],
    kpis: [{ label: "Tomgang", targetValue: 25, currentValue: null, unit: "%", contractRef: null }],
    ...overrides,
  };
}

describe("old and new values for a project edit", () => {
  it("lists only what changed, with readable values", () => {
    const before = buildProjectSnapshot(project());
    const after = buildProjectSnapshot(
      project({
        status: "ACTIVE",
        contractSizeNok: 90_000_000,
        endDate: new Date("2027-12-20"),
        description: "Graving og sprengning",
        city: "  ",
      }),
    );

    expect(diffSnapshots(before, after)).toEqual([
      { label: "Beskrivelse", from: null, to: "Graving og sprengning" },
      { label: "Poststed", from: "Oslo", to: null },
      { label: "Kontraktssum", from: "84 500 000 kr", to: "90 000 000 kr" },
      { label: "Status", from: "Planlegging", to: "Aktiv" },
      { label: "Sluttfrist", from: null, to: "20.12.2027" },
    ]);
  });

  it("reports nothing when a save changes nothing", () => {
    expect(diffSnapshots(buildProjectSnapshot(project()), buildProjectSnapshot(project()))).toEqual([]);
  });

  it("tracks custom fields, the mass plan and contract goals", () => {
    const before = buildProjectSnapshot(project());
    const after = buildProjectSnapshot(
      project({
        fieldValues: [{ value: "false", definition: { label: "Miljøsertifisert", fieldType: "BOOLEAN" } }],
        massTypes: [
          { plannedIn: 1200, plannedOut: 9000, massType: { name: "Stein", unit: "m3" } },
          { plannedIn: 0, plannedOut: 300, massType: { name: "Leire", unit: "m3" } },
        ],
        kpis: [],
      }),
    );

    expect(diffSnapshots(before, after)).toEqual([
      { label: "Felt «Miljøsertifisert»", from: "Ja", to: "Nei" },
      { label: "Masseplan Stein", from: "inn 1 200 m3, ut 12 500 m3", to: "inn 1 200 m3, ut 9 000 m3" },
      { label: "Kontraktsmål «Tomgang»", from: "mål 25 %, målt ikke registrert", to: null },
      { label: "Masseplan Leire", from: null, to: "inn 0 m3, ut 300 m3" },
    ]);
  });

  it("keeps two contract goals with the same name apart", () => {
    const kpi = { label: "CO2", targetValue: 10, currentValue: 5, unit: "kg", contractRef: "B 4.2" };
    const snapshot = buildProjectSnapshot(project({ kpis: [kpi, { ...kpi, targetValue: 20 }] }));

    expect(snapshot["Kontraktsmål «CO2»"]).toBe("mål 10 kg, målt 5 kg, ref. B 4.2");
    expect(snapshot["Kontraktsmål «CO2» (2)"]).toBe("mål 20 kg, målt 5 kg, ref. B 4.2");
  });

  it("formats numbers and dates without locale surprises", () => {
    expect(auditNumber(1234.5, "kg")).toBe("1 234,5 kg");
    expect(auditNumber(null)).toBeNull();
    expect(auditDate(new Date("2026-03-02T00:00:00Z"))).toBe("02.03.2026");
    expect(auditDate(null)).toBeNull();
  });
});

describe("site zone changes", () => {
  const square: Array<[number, number]> = [
    [10, 59],
    [11, 59],
    [11, 60],
    [10, 60],
  ];
  const zone = (overrides: Partial<AuditZone> = {}): AuditZone => ({
    id: "z1",
    name: "Riggplass",
    color: "#2563EB",
    coordinates: square,
    ...overrides,
  });

  it("describes added, removed, renamed, recoloured and redrawn zones", () => {
    const moved: Array<[number, number]> = [[10.5, 59], ...square.slice(1)];
    const changes = diffZones(
      [zone(), zone({ id: "z2", name: "Deponi" }), zone({ id: "z3", name: "Lager" })],
      [
        zone({ name: "Rigg nord", color: "#D97706", coordinates: [...square, [10.5, 60.5]] }),
        zone({ id: "z3", name: "Lager", coordinates: moved }),
        zone({ id: "z4", name: "Ny sone" }),
      ],
    );

    expect(changes).toEqual([
      { label: "Sone «Riggplass»: navn", from: "Riggplass", to: "Rigg nord" },
      { label: "Sone «Rigg nord»: farge", from: "#2563EB", to: "#D97706" },
      { label: "Sone «Rigg nord»: område", from: "4 punkter", to: "5 punkter" },
      { label: "Sone «Deponi»", from: "4 punkter", to: null },
      { label: "Sone «Lager»: område", from: "4 punkter", to: "4 punkter, flyttet" },
      { label: "Sone «Ny sone»", from: null, to: "Ny sone, 4 punkter" },
    ]);
  });

  it("reports nothing for an unchanged save", () => {
    expect(diffZones([zone()], [zone({ color: "#2563eb" })])).toEqual([]);
  });
});

describe("activity entries", () => {
  const lookups = {
    users: new Map([["u1", { id: "u1", name: "Kari", phone: null, email: null, role: "customer" }]]),
    customers: new Map<number, string | null>([[42, "Demo Entreprenør AS"]]),
    projects: new Map([["p1", { projectNumber: "P-100", name: "Bjørvika", customerId: 42 }]]),
  };
  const row = {
    id: "a1",
    customerId: null,
    userId: "u1",
    projectId: "p1",
    action: "project.setup.update",
    metadata: { changes: [{ label: "Status", from: "Planlegging", to: "Aktiv" }] },
    createdAt: new Date("2026-11-22T10:00:00Z"),
  };

  it("connects an entry to user, company and project", () => {
    expect(toAuditActivity(row, lookups)).toMatchObject({
      category: "PROJECT",
      description: "Endret prosjektoppsett",
      user: { id: "u1", name: "Kari" },
      userDeleted: false,
      customer: { id: 42, name: "Demo Entreprenør AS" },
      project: { id: "p1", label: "P-100 Bjørvika", exists: true },
      changes: [{ label: "Status", from: "Planlegging", to: "Aktiv" }],
    });
  });

  it("keeps the stored project name when the project and user are gone", () => {
    const item = toAuditActivity(
      { ...row, customerId: 42, userId: "u-gone", projectId: "p-gone", metadata: { projectLabel: "P-7 Gammelt" } },
      lookups,
    );

    expect(item.project).toEqual({ id: "p-gone", label: "P-7 Gammelt", exists: false });
    expect(item.user).toBeNull();
    expect(item.userDeleted).toBe(true);
  });

  it("shows old and new project lead", () => {
    const item = toAuditActivity(
      {
        ...row,
        action: "project.lead.changed",
        metadata: { leadUserId: "u1", changes: [{ label: "Prosjektleder", from: "Per", to: "Kari" }] },
      },
      lookups,
    );

    expect(item.description).toBe("Byttet prosjektleder");
    expect(item.changes).toEqual([{ label: "Prosjektleder", from: "Per", to: "Kari" }]);
  });

  it("rebuilds what it can for access entries stored before values were recorded", () => {
    const legacy = (action: string, metadata: Record<string, string>) =>
      toAuditActivity({ ...row, action, metadata }, lookups).changes;

    expect(legacy("project.lead.changed", { leadUserId: "u1" })).toEqual([
      { label: "Prosjektleder", from: "Ikke registrert", to: "Kari" },
    ]);
    expect(legacy("project.participant.added", { participantUserId: "u1" })).toEqual([
      { label: "Deltaker", from: null, to: "Kari" },
    ]);
    expect(legacy("project.participant.removed", { participantUserId: "u-gone" })).toEqual([
      { label: "Deltaker", from: "Slettet bruker", to: null },
    ]);
    expect(legacy("project.zones.updated", {})).toEqual([]);
  });

  it("files a pure mass plan edit under Masse and unknown actions under Annet", () => {
    const massOnly = [{ label: "Masseplan Stein", from: "inn 1 m3, ut 2 m3", to: null }];
    expect(describeAuditAction("project.setup.update", massOnly)).toEqual({
      category: "MASSES",
      label: "Endret masseplan",
    });
    expect(describeAuditAction("something.new")).toEqual({ category: "OTHER", label: "something.new" });
  });

  it("ignores malformed stored changes", () => {
    expect(parseAuditChanges({ changes: [{ label: "Status", from: 1, to: "Aktiv" }, "x", { from: "a" }] })).toEqual([
      { label: "Status", from: null, to: "Aktiv" },
    ]);
    expect(parseAuditChanges(null)).toEqual([]);
  });

  it("describes a login", () => {
    const login = toLoginActivity({ id: "l1", provider: "vipps", loggedAt: new Date("2026-11-22T09:00:00Z"), user: null });
    expect(login).toMatchObject({ category: "LOGIN", description: "Logget inn med Vipps", changes: [] });
  });
});
