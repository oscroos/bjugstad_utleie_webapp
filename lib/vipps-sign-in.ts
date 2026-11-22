import { prisma } from "@/lib/prisma";

// Decides whether a Vipps login may proceed, and as which portal user.
//
// Follows Vipps' own guidance for linking accounts:
//   1. The Vipps user id (`sub`, stored as the account's providerAccountId) is the
//      stable identifier. A Vipps account that is already linked logs in as its
//      linked user, also after the person has changed phone number.
//   2. Only when the Vipps id is unknown do we fall back to the verified phone
//      number, to link the Vipps account to a user an administrator has created.
//   3. Users are never created by logging in. Unknown people are sent back to the
//      login page.
//
// The check fails closed: a missing phone number or an unexpected error blocks
// the login instead of letting it through.

export type VippsSignInError =
  | "PhoneNumberMissing"
  | "LoginCheckFailed"
  | "OAuthAccountNotLinked"
  | "UserNotFound";

export type VippsSignInDecision =
  | { allow: true; userId: string; matchedBy: "vipps_id" | "phone" }
  | { allow: false; error: VippsSignInError; email?: string };

export type VippsClaims = {
  /** Normalised to +47... form, or null when Vipps sent no usable number. */
  phoneNumber: string | null;
  email: string | null;
  name: string | null;
  address: {
    address_street?: string;
    address_postal_code?: string;
    address_region?: string;
  };
};

export type VippsAccountTokens = {
  type?: string | null;
  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
};

type PortalUser = { id: string; phone: string | null; email: string | null; name: string | null };

const USER_SELECT = { id: true, phone: true, email: true, name: true } as const;

/** Picks the fields we use out of the raw Vipps profile. */
export function readVippsClaims(profile: unknown, fallbackEmail?: string | null): VippsClaims {
  const claims = isRecord(profile) ? profile : {};
  const address = isRecord(claims.address) ? claims.address : {};
  return {
    phoneNumber: normalizeVippsPhone(text(claims.phone_number)),
    email: text(claims.email) ?? text(fallbackEmail),
    name: text(claims.name),
    address: {
      address_street: text(address.street_address) ?? undefined,
      address_postal_code: text(address.postal_code) ?? undefined,
      address_region: text(address.region) ?? undefined,
    },
  };
}

export async function decideVippsSignIn(input: {
  provider: string | null | undefined;
  providerAccountId: string | null | undefined;
  claims: VippsClaims;
  tokens: VippsAccountTokens;
}): Promise<VippsSignInDecision> {
  const { provider, providerAccountId, claims } = input;

  try {
    if (!provider || !providerAccountId) return deny("LoginCheckFailed");
    if (!claims.phoneNumber) return deny("PhoneNumberMissing");

    // 1. Known Vipps id: same person as last time, whatever their phone number is now.
    const linked = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      select: { user: { select: USER_SELECT } },
    });
    if (linked) {
      await syncProfile(linked.user, claims);
      return { allow: true, userId: linked.user.id, matchedBy: "vipps_id" };
    }

    // 2. First login with this Vipps account: link it to the user with this phone number.
    const userByPhone = await prisma.user.findUnique({
      where: { phone: claims.phoneNumber },
      select: USER_SELECT,
    });
    if (userByPhone) {
      await prisma.account.create({
        data: {
          userId: userByPhone.id,
          type: input.tokens.type ?? "oauth",
          provider,
          providerAccountId,
          refresh_token: input.tokens.refresh_token ?? null,
          access_token: input.tokens.access_token ?? null,
          expires_at: input.tokens.expires_at ?? null,
          token_type: input.tokens.token_type ?? null,
          scope: input.tokens.scope ?? null,
          id_token: input.tokens.id_token ?? null,
          session_state: input.tokens.session_state ?? null,
        },
      });
      await syncProfile(userByPhone, claims);
      return { allow: true, userId: userByPhone.id, matchedBy: "phone" };
    }

    // 3. Unknown phone number. If the e-mail belongs to a user with another phone
    //    number we do not merge the two; an administrator has to sort it out.
    const userByEmail = claims.email
      ? await prisma.user.findUnique({ where: { email: claims.email }, select: { id: true } })
      : null;
    if (userByEmail) return deny("OAuthAccountNotLinked", claims.email ?? undefined);

    return deny("UserNotFound");
  } catch (error) {
    // Only the kind of error is logged; the message can contain user data.
    console.error("[auth:signIn] sign-in check failed:", errorKind(error));
    return deny("LoginCheckFailed");
  }
}

/**
 * Copies new details from Vipps onto the user. Best effort: the person is already
 * identified, so a failed update is logged and does not block the login.
 */
async function syncProfile(user: PortalUser, claims: VippsClaims) {
  try {
    const updates: {
      phone?: string;
      email?: string;
      name?: string;
      address_street?: string;
      address_postal_code?: string;
      address_region?: string;
    } = {};

    // Phone and e-mail are unique per user, so they are only taken when free.
    if (claims.phoneNumber && claims.phoneNumber !== user.phone) {
      const owner = await prisma.user.findUnique({ where: { phone: claims.phoneNumber }, select: { id: true } });
      if (!owner) updates.phone = claims.phoneNumber;
      else if (owner.id !== user.id) {
        console.warn("[auth:signIn] new phone number already belongs to another user; kept the old one for", user.id);
      }
    }
    if (!user.email && claims.email) {
      const owner = await prisma.user.findUnique({ where: { email: claims.email }, select: { id: true } });
      if (!owner) updates.email = claims.email;
    }
    if (!user.name && claims.name) updates.name = claims.name;
    if (claims.address.address_street) updates.address_street = claims.address.address_street;
    if (claims.address.address_postal_code) updates.address_postal_code = claims.address.address_postal_code;
    if (claims.address.address_region) updates.address_region = claims.address.address_region;

    if (Object.keys(updates).length > 0) {
      await prisma.user.update({ where: { id: user.id }, data: updates });
    }
  } catch (error) {
    console.error("[auth:signIn] could not update profile from Vipps for", user.id, errorKind(error));
  }
}

/**
 * Vipps sends the number with country code and no plus sign ("4712345678"); users
 * are stored as "+4712345678". Anything that is not a plain number is rejected.
 */
function normalizeVippsPhone(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, "");
  if (/^\+\d+$/.test(compact)) return compact;
  if (/^\d+$/.test(compact)) return `+${compact}`;
  return null;
}

function deny(error: VippsSignInError, email?: string): VippsSignInDecision {
  return email ? { allow: false, error, email } : { allow: false, error };
}

function errorKind(error: unknown) {
  if (!isRecord(error)) return typeof error;
  const code = typeof error.code === "string" ? ` ${error.code}` : "";
  return `${typeof error.name === "string" ? error.name : "Error"}${code}`;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
