// lib/auth.ts
// Purpose: The single source of truth for NextAuth config.
// - Wires the Vipps provider (prod) and a Credentials provider (dev convenience).
// - Uses PrismaAdapter to store users/accounts in your DB.
// - Shapes the JWT/session so the client (`useSession`) and middleware (`auth()`) can read flags.
// - Exports `handlers` (used by app/api/auth/[...nextauth]/route.ts), `auth` (server helper),
//   and server-side `signIn/signOut` helpers.
//
// Vipps specifics:
// - clientId, clientSecret, and issuer are read from env vars. `issuer` differs for apitest vs prod.
// - When the login page calls signIn("vipps"), NextAuth redirects to Vipps,
//   then Vipps redirects back to /api/auth/callback/vipps, which is served by `handlers` below.

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import Vipps from "next-auth/providers/vipps";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { decideVippsSignIn, readVippsClaims } from "./vipps-sign-in";
import {
  DEV_VIPPS_BYPASS_ENABLED,
  IS_DEV,
  VIPPS_DATA_REQUESTS,
  SESSION_USER_FIELDS,
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  DEV_BYPASS_USER_ID,
  DEV_BYPASS_USER_NAME,
  DEV_BYPASS_USER_PHONE,
} from "./constants";

export const authConfig: NextAuthConfig = {
  // Persist users/accounts (e.g., Vipps <-> local user link) in your database
  adapter: PrismaAdapter(prisma),

  // JWT sessions (no DB-backed sessions). Middleware and client read from the JWT.
  session: {
    strategy: "jwt",
    // Shorten session lifetime to 5 hours and refresh periodically while active.
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },

  // Debug helps in dev; avoid in prod as it leaks info to the client
  debug: IS_DEV,

  providers: [
    // === Vipps (production) ===
    Vipps({
      // Set these in .env(.local) from the Vipps MobilePay portal:
      // AUTH_VIPPS_ID, AUTH_VIPPS_SECRET, AUTH_VIPPS_ISSUER
      // issuer example: https://apitest.vipps.no (dev) or https://api.vipps.no (prod)
      clientId: process.env.AUTH_VIPPS_ID!,
      clientSecret: process.env.AUTH_VIPPS_SECRET!,
      issuer: process.env.AUTH_VIPPS_ISSUER, // apitest in dev, api in prod

      // Ask Vipps for additional user data (name, email, phone, address).
      // IMPORTANT: We include "phoneNumber" in scope so we get phone_number from Vipps.
      authorization: {
        params: {
          // TODO. Make sure we store the data we request in the DB.
          //       Also decide how to refresh user data over time (at every login? after X days?)
          scope: VIPPS_DATA_REQUESTS,
        },
      },
    }),

    // === Credentials (added in DEV only if flagged) ===
    // Allows signIn("credentials") from the login page without hitting Vipps.
    ...(IS_DEV && DEV_VIPPS_BYPASS_ENABLED
      ? [
        Credentials({
          name: "Dev Login",
          credentials: {}, // no form; triggered programmatically
          async authorize() {
            const user = await loadDevBypassUser();

            if (!user) {
              console.error(
                `[auth:dev-bypass] Could not find ${DEV_BYPASS_USER_NAME} by id ${DEV_BYPASS_USER_ID} or phone ${DEV_BYPASS_USER_PHONE}.`,
              );
              return null;
            }

            return {
              ...user,
              devBypass: true,
            };
          },
        }),
      ]
      : []),
  ],

  // If NextAuth needs to prompt for login, it sends users here.
  // Your middleware also redirects unauthenticated users here.
  pages: {
    signIn: "/login",
    newUser: "/onboarding", // redirect new users to onboarding
    error: "/login", // error code passed in query string as ?error=
  },

  callbacks: {
    /**
     * Gate for every login. The rules live in lib/vipps-sign-in.ts:
     * the linked Vipps id is checked first, the verified phone number is only
     * used to link a Vipps account the first time, nobody is created by logging
     * in, and a missing phone number or a failed check blocks the login.
     */
    async signIn({ user, account, profile }) {
      // Debug info in dev. Never log the user, account or profile objects: they hold
      // contact details and the Vipps access tokens.
      if (process.env.NODE_ENV !== "production") {
        console.log("[auth:signIn] provider =", account?.provider, "user id =", user?.id);
      }

      // The dev login (only registered in development) has no Vipps data to check.
      if (account?.provider === "credentials") {
        return true;
      }

      const decision = await decideVippsSignIn({
        provider: account?.provider,
        providerAccountId: account?.providerAccountId,
        claims: readVippsClaims(profile, user?.email),
        tokens: {
          type: account?.type,
          refresh_token: account?.refresh_token,
          access_token: account?.access_token,
          expires_at: account?.expires_at,
          token_type: account?.token_type,
          scope: account?.scope,
          id_token: account?.id_token,
          session_state: typeof account?.session_state === "string" ? account.session_state : null,
        },
      });

      if (decision.allow) {
        console.log("[auth:signIn] allowed, matched by", decision.matchedBy, "user id =", decision.userId);
        return true;
      }

      // Back to the login page, which shows a message for the error code.
      console.log("[auth:signIn] blocked:", decision.error);
      const query = new URLSearchParams({ error: decision.error });
      if (decision.email) query.set("email", decision.email);
      const path = `/login?${query.toString()}`;
      const origin = process.env.NEXTAUTH_URL;
      return origin ? new URL(path, origin).toString() : path;
    },

    // Runs whenever a JWT is created/updated (e.g., after Vipps callback).
    // Put extra fields you care about onto the token.
    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        const userId = typeof user.id === "string" ? user.id : undefined;
        if (userId) {
          token.uid = userId;
        }
        token.acceptedTerms = user.acceptedTerms ?? false;
        copyUserFields(token as any, user as any);
        token.accesses = userId ? await loadSessionAccesses(userId) : [];
        (token as any).devBypass =
          account?.provider === "credentials" &&
          IS_DEV &&
          DEV_VIPPS_BYPASS_ENABLED &&
          (user.devBypass === true);
      }
      if (trigger === "update") {
        if (session?.user) {
          copyUserFields(token as any, session.user as any);
          token.accesses = Array.isArray(session.user.accesses)
            ? session.user.accesses
            : token.accesses;
          if (typeof session.user.devBypass === "boolean") {
            (token as any).devBypass = session.user.devBypass;
          }
        } else if (token.uid) {
          const latest = await prisma.user.findUnique({ where: { id: token.uid as string } });
          copyUserFields(token as any, latest as any);
          token.accesses = await loadSessionAccesses(token.uid as string);
        }
        if (typeof session?.acceptedTerms === "boolean") {
          token.acceptedTerms = session.acceptedTerms;
        }
      }
      return token;
    },

    // Shape what `useSession()` sees on the client.
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.acceptedTerms = (token.acceptedTerms as boolean) ?? false;
        copyUserFields(session.user as any, token as any);
        session.user.devBypass = Boolean((token as any).devBypass);
        session.user.accesses = (token as any).accesses ?? [];
      }
      return session;
    },
  },

  events: {
    // Callback after a successful sign-in
    async signIn({ user, account }: { user: any; account?: any }) {
      console.log("Event: signIn for user", user.id);
      if (account?.provider !== "vipps") return;

      // Phone, e-mail, name and address from Vipps are copied to the user during the
      // sign-in check (lib/vipps-sign-in.ts), which knows when a phone number or
      // e-mail is already taken. Here we only bump the "last login" timestamp, and
      // only for users that have completed onboarding once.
      if (user.lastLoginAt) {
        try {
          await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        } catch (err) {
          // Fail-open: the user is already signed in.
          console.error("[auth:events.signIn] failed to update last login for", user.id, (err as Error)?.name);
        }
      }

      // Log the login event for analytics (non-blocking).
      try {
        // The analytics table may not exist in all deployments; cast to `any` to avoid
        // TypeScript errors while still attempting to record the event if available.
        await (prisma as any).userLoginEvent.create({
          data: {
            userId: user.id,
            provider: account?.provider ?? "unknown",
          },
        });
      } catch (err) {
        if (IS_DEV) {
          console.error("[auth:events.signIn] failed to log login event", err);
        }
        // Fail-open: do not block auth if logging fails.
      }
    },
  },
};

// Export the NextAuth-bound pieces used across the app:
// - `handlers`: bound to /api/auth/[...nextauth] (serves Vipps signin/callback endpoints).
// - `auth`: server helper to read the current session (used by middleware, route handlers, RSC).
// - `signIn`/`signOut`: server-side helpers if you need them in actions/handlers.
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);


// ========= HHELPER FUNCTIONS ==========

// copyUserFields pushes the whitelisted profile columns from one object into another
// so the JWT/session always mirrors the latest Prisma user record without re-specifying
// each field in every callback.
function copyUserFields(target: Record<string, unknown>, source: Record<string, unknown> | null | undefined) {
  if (!source) return;
  for (const key of SESSION_USER_FIELDS) {
    if (source[key] !== undefined) {
      target[key] = source[key] instanceof Date ? source[key].toISOString() : source[key];
    }
  }
}

async function loadSessionAccesses(userId: string) {
  try {
    const entries = await (prisma as any).userCustomerAccess.findMany({
      where: { userId },
      select: {
        customerId: true,
        role: true,
        customer: {
          select: {
            name: true,
            customer_number: true,
          },
        },
      },
      orderBy: {
        customer: {
          name: "asc",
        },
      },
    });

    type AccessEntry = typeof entries[number];

    return entries.map((entry: AccessEntry) => ({
      customerId: entry.customerId,
      role: entry.role,
      customer: entry.customer
        ? {
          name: entry.customer.name,
          customer_number: entry.customer.customer_number,
        }
        : null,
    }));
  } catch (error) {
    console.error("Failed to load accesses for user", userId, error);
    return [];
  }
}

async function loadDevBypassUser() {
  const select = {
    id: true,
    name: true,
    email: true,
    phone: true,
    role: true,
    address_street: true,
    address_postal_code: true,
    address_region: true,
    createdAt: true,
    updatedAt: true,
    acceptedTerms: true,
    acceptedTermsVersion: true,
    lastLoginAt: true,
  } as const;

  const userById = await prisma.user.findUnique({
    where: { id: DEV_BYPASS_USER_ID },
    select,
  });
  if (userById) return userById;

  return prisma.user.findUnique({
    where: { phone: DEV_BYPASS_USER_PHONE },
    select,
  });
}
