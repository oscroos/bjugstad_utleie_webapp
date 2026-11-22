import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAccount: vi.fn(),
  createAccount: vi.fn(),
  findUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: { findUnique: mocks.findAccount, create: mocks.createAccount },
    user: { findUnique: mocks.findUser, update: mocks.updateUser },
  },
}));

import { decideVippsSignIn, readVippsClaims } from "@/lib/vipps-sign-in";

const kari = { id: "u-kari", phone: "+4790000001", email: "kari@example.com", name: "Kari" };

function signIn(profile: Record<string, unknown>, overrides: Partial<Parameters<typeof decideVippsSignIn>[0]> = {}) {
  return decideVippsSignIn({
    provider: "vipps",
    providerAccountId: "sub-1",
    claims: readVippsClaims(profile),
    tokens: { type: "oidc", access_token: "token" },
    ...overrides,
  });
}

/** Answers user lookups by phone or e-mail from a small table. */
function usersInDatabase(users: Array<typeof kari>) {
  mocks.findUser.mockImplementation(async ({ where }: { where: { phone?: string; email?: string } }) =>
    users.find((user) => (where.phone ? user.phone === where.phone : user.email === where.email)) ?? null,
  );
}

describe("reading Vipps claims", () => {
  it("normalises the phone number and tolerates missing fields", () => {
    expect(readVippsClaims({ phone_number: "4790000001", name: " Kari ", address: { region: "Oslo" } })).toEqual({
      phoneNumber: "+4790000001",
      email: null,
      name: "Kari",
      address: { address_street: undefined, address_postal_code: undefined, address_region: "Oslo" },
    });
    expect(readVippsClaims(undefined, "fallback@example.com")).toMatchObject({
      phoneNumber: null,
      email: "fallback@example.com",
    });
    expect(readVippsClaims({ phone_number: "ikke et nummer" }).phoneNumber).toBeNull();
  });
});

describe("Vipps sign-in check", () => {
  it("blocks the login when Vipps sends no phone number", async () => {
    expect(await signIn({ email: "kari@example.com" })).toEqual({ allow: false, error: "PhoneNumberMissing" });
    expect(mocks.findAccount).not.toHaveBeenCalled();
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("blocks the login when the Vipps id is missing", async () => {
    expect(await signIn({ phone_number: "4790000001" }, { providerAccountId: undefined })).toEqual({
      allow: false,
      error: "LoginCheckFailed",
    });
  });

  it("blocks the login when the check itself fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findAccount.mockRejectedValue(new Error("database unreachable for +4790000001"));

    expect(await signIn({ phone_number: "4790000001" })).toEqual({ allow: false, error: "LoginCheckFailed" });
    // The error message may contain user data, so only its kind is logged.
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("90000001");
    consoleError.mockRestore();
  });

  it("logs a linked Vipps account in as its user, also after a phone number change", async () => {
    mocks.findAccount.mockResolvedValue({ user: kari });
    usersInDatabase([kari]);

    expect(await signIn({ phone_number: "4791111111" })).toEqual({
      allow: true,
      userId: "u-kari",
      matchedBy: "vipps_id",
    });
    expect(mocks.findAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider_providerAccountId: { provider: "vipps", providerAccountId: "sub-1" } },
      }),
    );
    expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: "u-kari" }, data: { phone: "+4791111111" } });
    expect(mocks.createAccount).not.toHaveBeenCalled();
  });

  it("keeps the old number when the new one belongs to another user, and still logs in", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const per = { id: "u-per", phone: "+4791111111", email: "per@example.com", name: "Per" };
    mocks.findAccount.mockResolvedValue({ user: kari });
    usersInDatabase([kari, per]);

    expect(await signIn({ phone_number: "4791111111" })).toMatchObject({ allow: true, userId: "u-kari" });
    expect(mocks.updateUser).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("links an unknown Vipps account to the user with the same phone number", async () => {
    mocks.findAccount.mockResolvedValue(null);
    usersInDatabase([kari]);

    expect(await signIn({ phone_number: "4790000001", email: "kari@example.com" })).toEqual({
      allow: true,
      userId: "u-kari",
      matchedBy: "phone",
    });
    expect(mocks.createAccount).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u-kari",
        provider: "vipps",
        providerAccountId: "sub-1",
        type: "oidc",
        access_token: "token",
      }),
    });
  });

  it("fills in missing profile details but never takes an e-mail that belongs to someone else", async () => {
    const noDetails = { id: "u-new", phone: "+4792222222", email: null as unknown as string, name: null as unknown as string };
    mocks.findAccount.mockResolvedValue(null);
    usersInDatabase([noDetails, kari]);

    await signIn({ phone_number: "4792222222", email: "kari@example.com", name: "Nora", address: { postal_code: "0191" } });

    expect(mocks.updateUser).toHaveBeenCalledWith({
      where: { id: "u-new" },
      data: { name: "Nora", address_postal_code: "0191" },
    });
  });

  it("does not block the login when the profile update fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findAccount.mockResolvedValue({ user: kari });
    usersInDatabase([kari]);
    mocks.updateUser.mockRejectedValue(new Error("write failed"));

    expect(await signIn({ phone_number: "4790000001", address: { region: "Oslo" } })).toMatchObject({ allow: true });
    consoleError.mockRestore();
  });

  it("refuses to merge when the e-mail belongs to a user with another phone number", async () => {
    mocks.findAccount.mockResolvedValue(null);
    usersInDatabase([kari]);

    expect(await signIn({ phone_number: "4793333333", email: "kari@example.com" })).toEqual({
      allow: false,
      error: "OAuthAccountNotLinked",
      email: "kari@example.com",
    });
    expect(mocks.createAccount).not.toHaveBeenCalled();
  });

  it("never creates a user: unknown people are sent back", async () => {
    mocks.findAccount.mockResolvedValue(null);
    usersInDatabase([kari]);

    expect(await signIn({ phone_number: "4794444444", email: "ukjent@example.com" })).toEqual({
      allow: false,
      error: "UserNotFound",
    });
    expect(mocks.createAccount).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
