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
import {
  IS_DEV,
  VIPPS_DATA_REQUESTS,
  SESSION_USER_FIELDS,
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  USE_CREDENTIALS_PROVIDER_FOR_DEV_ONLY,
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
    ...(IS_DEV && USE_CREDENTIALS_PROVIDER_FOR_DEV_ONLY
      ? [
        Credentials({
          name: "Dev Login",
          credentials: {}, // no form; triggered programmatically
          async authorize() {
            // Return a minimal user-like object. With session:'jwt',
            // it doesn't need to exist in the DB.
            return {
              id: "dev-user",
              name: "Dev User",
              email: "dev@example.com",
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
     * Custom signIn gate.
     *
     * GOALS:
     *
     * 1. PHONE NUMBER is our primary identity key.
     *    - profile.phone_number is what we trust from Vipps.
     *    - users.phone in our DB must be unique.
     *
     *    If that phone already exists in the DB:
     *      -> This is (most likely) the same human coming back.
     *      -> We allow login IFF the Vipps account is already linked to that user.
     *         If it's not linked, we send them back to /login with
     *         error=OAuthAccountNotLinked (your existing UX).
     *
     * 2. EMAIL is optional.
     *    - Can be null.
     *    - But if Vipps gives us an email, that email cannot already be owned
     *      by *some other* phone in our system.
     *      (We don't want two totally different phone numbers reusing one email.)
     *
     * 3. BRAND NEW USER FLOW:
     *    - If phone_number is not in DB yet,
     *      AND the email (if present) is not already linked to someone else,
     *      then we let NextAuth create/link the new user and we immediately
     *      redirect them to /onboarding instead of dropping them straight into the app.
     *
     * 4. We keep your "OAuthAccountNotLinked" UX:
     *    - If the login creds don't line up with the stored link between
     *      this Vipps account and the existing user, we bounce with that error.
     */
    async signIn({ user, account, profile }) {
      // Debug info in dev
      if (process.env.NODE_ENV !== "production") {
        console.log("User data available:");
        console.log("[auth:signIn] user =", JSON.stringify(user, null, 2)); // DB-ish user object (maybe newly created by adapter)
        console.log("[auth:signIn] account =", JSON.stringify(account, null, 2)); // Data returned by Vipps account link
        console.log("[auth:signIn] profile =", JSON.stringify(profile, null, 2)); // Raw Vipps claims (phone_number, email, etc.)
      }

      const origin = process.env.NEXTAUTH_URL!;

      try {
        const provider = account?.provider; // "vipps"
        const providerAccountId = account?.providerAccountId; // maps to profile.sub

        // Canonical fields from Vipps (based on your logs):
        // - profile.email
        // - profile.phone_number (string like "4745938863")
        // Fallback to user.* if needed, but profile is the source of truth here.
        const emailAddr =
          (typeof (profile as any)?.email === "string" && (profile as any).email) ||
          (typeof user?.email === "string" && user.email) ||
          undefined;

        const emailVerified =
          typeof (profile as any)?.email_verified === 'boolean' ? (profile as any).email_verified : undefined;

        /*
      const phoneNumberRaw =
        (typeof (profile as any)?.phone_number === "string" &&
          (profile as any).phone_number) ||
        (typeof (user as any)?.phone === "string" && (user as any).phone) ||
        undefined;
        */
        const phoneNumberVipps = (profile as any)?.phone_number as string | undefined;

        const phoneNumber = normalizePhone(phoneNumberVipps);

        const addressData = mapAddress((profile as any)?.address);

        console.log("phone number:", phoneNumberVipps, phoneNumber);
        console.log("email address:", emailAddr);
        console.log("email verified:", emailVerified);
        console.log("address data:", addressData);

        // Sanity guard: if we *somehow* didn't get a provider or providerAccountId,
        // just let NextAuth continue. (Avoids hard-crash in edge cases.)
        if (!provider || !providerAccountId) {
          console.log("provider or providerAccountId MISSING!");
          return true;
        }

        // We rely heavily on phone_number. If Vipps didn't send phone_number for some reason,
        // we can't apply our phone-based security logic. Let NextAuth proceed (graceful degrade).
        if (!phoneNumber) {
          console.log("phone number for this Vipps user is MISSING!");
          return true;
        }

        // Look up existing user by phone (primary identity).
        const userByPhone = await prisma.user.findUnique({
          where: { phone: phoneNumber },
          select: { id: true, phone: true, email: true },
        });

        // Look up user by email (for collision checks), but ONLY if we actually got an email.
        // Email is allowed to be null/undefined.
        const userByEmail = emailAddr
          ? await prisma.user.findUnique({
            where: { email: emailAddr },
            select: { id: true, phone: true, email: true },
          })
          : null;

        // === CASE 1: Returning user (phone already in DB) ===========================
        //
        // If phoneNumber already exists in our DB, treat this as "same human".
        // We now must verify that THIS Vipps account is linked to THAT user.
        if (userByPhone) {
          console.log("userByPhone found:", userByPhone);

          // Update user record with any new data from Vipps (if we have it).
          const updates: any = {};
          if (!userByPhone.email && emailAddr) updates.email = emailAddr;
          //if (fullName) updates.name = fullName;
          if (phoneNumber && userByPhone.phone !== phoneNumber) updates.phone = phoneNumber; // optional strictness
          if (addressData.address_street) updates.address_street = addressData.address_street;
          if (addressData.address_postal_code) updates.address_postal_code = addressData.address_postal_code;
          if (addressData.address_region) updates.address_region = addressData.address_region;
          //if (emailVerified) updates.emailVerified = new Date();

          if (Object.keys(updates).length > 0 && user?.id) {
            // Commented out to allow for manual DB insertion of user
            //await prisma.user.update({ where: { id: user.id }, data: updates });

            await prisma.user.update({ where: { phone: phoneNumber }, data: updates });
          }

          const linkedAccount = await prisma.account.findUnique({
            where: { provider_providerAccountId: { provider, providerAccountId } },
            select: { id: true, userId: true },
          });

          if (linkedAccount && linkedAccount.userId !== userByPhone.id) {
            console.log("userByPhone is linked to a different Vipps account!");
            // The phone matches an existing user, but this Vipps account isn't
            // linked to that user. We do NOT silently merge.
            // -> redirect back to /login with an OAuthAccountNotLinked-style error.
            const url = new URL("/login", origin);
            url.searchParams.set("error", "OAuthAccountNotLinked");
            if (emailAddr) {
              // Show the email if we have it (you already display this on the login page).
              url.searchParams.set("email", emailAddr);
            }
            return url.toString();
          }

          if (!linkedAccount) {
            await prisma.account.create({
              data: {
                userId: userByPhone.id,
                type: account?.type ?? "oauth",
                provider,
                providerAccountId,
                refresh_token: account?.refresh_token ?? null,
                access_token: account?.access_token ?? null,
                expires_at: account?.expires_at ?? null,
                token_type: account?.token_type ?? null,
                scope: account?.scope ?? null,
                id_token: (account as any)?.id_token ?? null,
                session_state: (account as any)?.session_state ?? null,
              },
            });
          }

          // OK: same phone, same linked Vipps account => legit returning user.
          // -> Allow normal sign-in flow (they'll land wherever NextAuth would normally send them).
          return true;
        }

        // === CASE 2: phone is NEW, but email belongs to someone else = BLOCK ========
        //
        // phoneNumber is not in DB (so this looks like a new device/user),
        // BUT Vipps email matches an existing user entry with a *different* phone.
        //
        // We disallow that because we don't want 2 different phones / humans
        // to share 1 email in our system.
        if (!userByPhone && userByEmail) {
          console.log("userByEmail found with different phone:", userByEmail);
          // -> redirect back to /login with an OAuthAccountNotLinked-style error.
          const url = new URL("/login", origin);
          url.searchParams.set("error", "OAuthAccountNotLinked");
          if (emailAddr) {
            url.searchParams.set("email", emailAddr);
          }
          return url.toString();
        }

        // === CASE 3: phone/email not found => block login ===========================
        //
        // We no longer allow creating brand new users implicitly. If we cannot find a
        // user for the provided phone/email, send them back to login with a clear
        // support message.
        if (!userByPhone && !userByEmail) {
          console.log("No matching user found for phone/email; blocking login until provisioned.");
          const url = new URL("/login", origin);
          url.searchParams.set("error", "UserNotFound");
          if (emailAddr) {
            url.searchParams.set("email", emailAddr);
          }
          return url.toString();
        }

        // We never fall through here, but keep 'return true' to silence TS warnings.
        return true;

      } catch (err) {
        // On any unexpected error, fall back to the normal flow.
        // We don't want a bug here to hard-block login in prod.
        if (IS_DEV) {
          console.error("[auth:signIn] unexpected error:", err);
        }
        return true;
      }
    },

    // Runs whenever a JWT is created/updated (e.g., after Vipps callback).
    // Put extra fields you care about onto the token.
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.uid = user.id;
        // @ts-expect-error - custom column on your Prisma User model
        token.acceptedTerms = user.acceptedTerms ?? false;
        copyUserFields(token as any, user as any);

        // In dev, pretend terms are accepted so middleware doesn't bounce you
        // (only if using Credentials provider).
        if (IS_DEV && USE_CREDENTIALS_PROVIDER_FOR_DEV_ONLY) {
          token.acceptedTerms = true;
        }
      }
      if (trigger === "update") {
        if (session?.user) {
          copyUserFields(token as any, session.user as any);
        } else if (token.uid) {
          const latest = await prisma.user.findUnique({ where: { id: token.uid as string } });
          copyUserFields(token as any, latest as any);
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
      }
      return session;
    },
  },

  events: {
    // Callback after a successful sign-in
    async signIn({ user, account, profile }: { user: any; account?: any; profile?: any }) {
      console.log("Event: signIn for user", user.id);
      if (account?.provider !== "vipps") return;
      console.log("Post-signIn event: syncing additional Vipps profile data for user", user.id)

      const phone = normalizePhone((profile as any)?.phone_number);
      const addressData = mapAddress((profile as any)?.address);
      const emailAddr = typeof (profile as any)?.email === "string" ? (profile as any).email : undefined;

      const updates: any = {};

      if (phone) updates.phone = phone;
      if (emailAddr && !user.email) updates.email = emailAddr;
      Object.assign(updates, addressData);
      if (user.lastLoginAt) {
        // Only bump the "last login" timestamp for users that have already completed onboarding once.
        updates.lastLoginAt = new Date();
      }

      if (Object.keys(updates).length) {
        await prisma.user.update({ where: { id: user.id }, data: updates });
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

// Normalize phone number from Vipps to "+<number>" format.
// If input is missing or invalid, returns undefined.
function normalizePhone(input?: string | null) {
  if (!input) return undefined;
  const s = input.trim();
  if (s.startsWith("+")) return s;

  if (/^\d+$/.test(s)) {
    // If it already starts with country code like "47..."
    return "+" + s;
  }

  return undefined;
}


function mapAddress(addr: any) {
  if (!addr || typeof addr !== 'object') return {};
  const street = typeof addr.street_address === 'string' ? addr.street_address : undefined;
  const postal = typeof addr.postal_code === 'string' ? addr.postal_code : undefined;
  const region = typeof addr.region === 'string' ? addr.region : undefined;
  return {
    address_street: street,
    address_postal_code: postal,
    address_region: region,
  };
}

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
