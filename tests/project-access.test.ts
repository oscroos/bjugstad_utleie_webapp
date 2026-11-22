import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findCompanyAccess: vi.fn(),
  findParticipant: vi.fn(),
  findParticipants: vi.fn(),
  createParticipant: vi.fn(),
  updateParticipants: vi.fn(),
  upsertParticipant: vi.fn(),
  deleteParticipant: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userCustomerAccess: { findUnique: mocks.findCompanyAccess },
    projectParticipant: {
      findUnique: mocks.findParticipant,
      findMany: mocks.findParticipants,
      create: mocks.createParticipant,
      updateMany: mocks.updateParticipants,
      upsert: mocks.upsertParticipant,
      delete: mocks.deleteParticipant,
    },
    $transaction: mocks.transaction,
  },
}));

import {
  addProjectParticipant,
  buildProjectAccessMembers,
  removeProjectParticipant,
  setProjectLead,
  type CompanyAccessRow,
  type ParticipantRow,
} from "@/lib/project-access";

const project = { id: "project-1", customerId: 42 };

function user(id: string, name: string, role: "customer" | "super_admin" = "customer") {
  return { id, name, phone: null, email: null, role };
}

function participant(
  id: string,
  name: string,
  role: ParticipantRow["role"],
  globalRole: "customer" | "super_admin" = "customer",
): ParticipantRow {
  return { userId: id, role, createdAt: new Date("2026-01-15T10:00:00Z"), user: user(id, name, globalRole) };
}

function companyAccess(
  id: string,
  name: string,
  role: CompanyAccessRow["role"],
  globalRole: "customer" | "super_admin" = "customer",
): CompanyAccessRow {
  return { userId: id, role, user: user(id, name, globalRole) };
}

describe("access list for a project", () => {
  it("lists the lead first, then participants, then company admins", () => {
    const members = buildProjectAccessMembers(
      [participant("u-per", "Per", "MEMBER"), participant("u-kari", "Kari", "OWNER"), participant("u-anne", "Anne", "PROJECT_MANAGER")],
      [
        companyAccess("u-per", "Per", "user"),
        companyAccess("u-kari", "Kari", "user"),
        companyAccess("u-anne", "Anne", "user"),
        companyAccess("u-ola", "Ola", "admin"),
      ],
    );

    expect(members.map((member) => [member.name, member.kind, member.canEditProject, member.isParticipant])).toEqual([
      ["Kari", "LEAD", true, true],
      ["Anne", "PARTICIPANT", true, true],
      ["Per", "PARTICIPANT", false, true],
      ["Ola", "COMPANY_ADMIN", true, false],
    ]);
    expect(members.every((member) => member.hasAccess)).toBe(true);
  });

  it("hides super admins who are participants or company admins", () => {
    const members = buildProjectAccessMembers(
      [participant("u-root", "Root", "PROJECT_MANAGER", "super_admin"), participant("u-per", "Per", "MEMBER")],
      [companyAccess("u-root2", "Root2", "admin", "super_admin"), companyAccess("u-per", "Per", "user")],
    );

    expect(members.map((member) => member.userId)).toEqual(["u-per"]);
  });

  it("lists a super admin who is the project lead, also without company access", () => {
    const members = buildProjectAccessMembers(
      [participant("u-root", "Root", "OWNER", "super_admin"), participant("u-per", "Per", "MEMBER")],
      [companyAccess("u-per", "Per", "user")],
    );

    expect(members.map((member) => [member.userId, member.kind])).toEqual([
      ["u-root", "LEAD"],
      ["u-per", "PARTICIPANT"],
    ]);
    expect(members[0]).toMatchObject({ hasAccess: true, canEditProject: true, isParticipant: true });
  });

  it("flags a participant who no longer belongs to the company", () => {
    const [member] = buildProjectAccessMembers([participant("u-gone", "Gone", "PROJECT_MANAGER")], []);

    expect(member.hasAccess).toBe(false);
    expect(member.canEditProject).toBe(false);
  });

  it("shows a company admin who is also lead once, as lead", () => {
    const members = buildProjectAccessMembers(
      [participant("u-ola", "Ola", "OWNER")],
      [companyAccess("u-ola", "Ola", "admin")],
    );

    expect(members).toHaveLength(1);
    expect(members[0].kind).toBe("LEAD");
  });
});

describe("adding a participant", () => {
  it("adds a company user with read access", async () => {
    mocks.findCompanyAccess.mockResolvedValue({ role: "user", user: { role: "customer", name: "Per" } });
    mocks.createParticipant.mockResolvedValue({});

    expect(await addProjectParticipant(project, "u-per")).toEqual({ ok: true, userName: "Per" });
    expect(mocks.findCompanyAccess).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_customerId: { userId: "u-per", customerId: 42 } } }),
    );
    expect(mocks.createParticipant).toHaveBeenCalledWith({
      data: { projectId: "project-1", userId: "u-per", role: "MEMBER" },
    });
  });

  it("rejects users outside the project's company", async () => {
    mocks.findCompanyAccess.mockResolvedValue(null);

    const result = await addProjectParticipant(project, "u-other");

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(mocks.createParticipant).not.toHaveBeenCalled();
  });

  it("rejects super admins and company admins, who have access already", async () => {
    mocks.findCompanyAccess.mockResolvedValueOnce({ role: "user", user: { role: "super_admin" } });
    expect(await addProjectParticipant(project, "u-root")).toMatchObject({ ok: false, status: 400 });

    mocks.findCompanyAccess.mockResolvedValueOnce({ role: "admin", user: { role: "customer" } });
    expect(await addProjectParticipant(project, "u-ola")).toMatchObject({ ok: false, status: 400 });

    expect(mocks.createParticipant).not.toHaveBeenCalled();
  });

  it("reports a user who is already a participant", async () => {
    mocks.findCompanyAccess.mockResolvedValue({ role: "user", user: { role: "customer" } });
    mocks.createParticipant.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));

    expect(await addProjectParticipant(project, "u-per")).toMatchObject({ ok: false, status: 409 });
  });
});

describe("changing the project lead", () => {
  it("demotes the old lead and promotes the new one in one transaction", async () => {
    mocks.findCompanyAccess.mockResolvedValue({ role: "user", user: { role: "customer", name: "Per" } });
    mocks.findParticipants.mockResolvedValue([{ user: { name: "Kari" } }]);
    mocks.updateParticipants.mockReturnValue("demote");
    mocks.upsertParticipant.mockReturnValue("promote");
    mocks.transaction.mockResolvedValue([]);

    expect(await setProjectLead(project, "u-per")).toEqual({
      ok: true,
      userName: "Per",
      previousLeadNames: ["Kari"],
    });
    expect(mocks.updateParticipants).toHaveBeenCalledWith({
      where: { projectId: "project-1", role: "OWNER", userId: { not: "u-per" } },
      data: { role: "MEMBER" },
    });
    expect(mocks.upsertParticipant).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: "project-1", userId: "u-per" } },
      update: { role: "OWNER" },
      create: { projectId: "project-1", userId: "u-per", role: "OWNER" },
    });
    expect(mocks.transaction).toHaveBeenCalledWith(["demote", "promote"]);
  });

  it("allows a company admin as lead but not someone outside the company", async () => {
    mocks.transaction.mockResolvedValue([]);
    mocks.findParticipants.mockResolvedValue([]);
    mocks.findCompanyAccess.mockResolvedValueOnce({ role: "admin", user: { role: "customer", name: "Ola" } });
    expect(await setProjectLead(project, "u-ola")).toMatchObject({ ok: true, previousLeadNames: [] });

    mocks.findCompanyAccess.mockResolvedValueOnce(null);
    expect(await setProjectLead(project, "u-other")).toMatchObject({ ok: false, status: 400 });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("removing a participant", () => {
  it("removes a participant", async () => {
    mocks.findParticipant.mockResolvedValue({ role: "MEMBER", user: { name: "Per" } });
    mocks.deleteParticipant.mockResolvedValue({});

    expect(await removeProjectParticipant(project, "u-per", "u-kari")).toEqual({
      ok: true,
      userName: "Per",
      removedRole: "MEMBER",
    });
    expect(mocks.deleteParticipant).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: "project-1", userId: "u-per" } },
    });
  });

  it("stops the lead from removing themself", async () => {
    mocks.findParticipant.mockResolvedValue({ role: "OWNER", user: { name: "Kari" } });

    expect(await removeProjectParticipant(project, "u-kari", "u-kari")).toMatchObject({ ok: false, status: 400 });
    expect(mocks.deleteParticipant).not.toHaveBeenCalled();
  });

  it("lets a company admin remove the lead", async () => {
    mocks.findParticipant.mockResolvedValue({ role: "OWNER", user: { name: "Kari" } });
    mocks.deleteParticipant.mockResolvedValue({});

    expect(await removeProjectParticipant(project, "u-kari", "u-ola")).toMatchObject({
      ok: true,
      removedRole: "OWNER",
    });
  });

  it("reports a user who is not a participant", async () => {
    mocks.findParticipant.mockResolvedValue(null);

    expect(await removeProjectParticipant(project, "u-nobody", "u-kari")).toMatchObject({ ok: false, status: 404 });
    expect(mocks.deleteParticipant).not.toHaveBeenCalled();
  });
});
