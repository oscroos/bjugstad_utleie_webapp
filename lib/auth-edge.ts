// lib/auth-edge.ts
// Purpose: Edge-safe NextAuth config used by middleware (and any Edge runtime code).
// IMPORTANT: Do NOT import Prisma or the Prisma adapter here — the Edge runtime
// cannot load Node-native binaries, and bundling them can cause WASM compile errors.

import NextAuth from "next-auth";
import Vipps from "next-auth/providers/vipps";
import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";
import {
  IS_DEV,
  USE_CREDENTIALS_PROVIDER_FOR_DEV_ONLY,
  SESSION_USER_FIELDS,
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "./constants";

const edgeAuthConfig: NextAuthConfig = {
  // Keep sessions JWT-only; no DB lookups required in the Edge runtime.
  session: {
    strategy: "jwt",
    // Shorten session lifetime to 5 hours and refresh periodically while active.
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  debug: IS_DEV,
  providers: [
    Vipps({
      clientId: process.env.AUTH_VIPPS_ID!,
      clientSecret: process.env.AUTH_VIPPS_SECRET!,
      issuer: process.env.AUTH_VIPPS_ISSUER,
    }),
    ...(IS_DEV && USE_CREDENTIALS_PROVIDER_FOR_DEV_ONLY
      ? [
        Credentials({
          name: "Dev Login",
          credentials: {},
          async authorize() {
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
  pages: {
    signIn: "/login",
    newUser: "/onboarding", // redirect new users to onboarding
  },
  callbacks: {
    // NOTE: No DB work in Edge. The OAuthAccountNotLinked redirect
    // happens in the Node runtime (lib/auth.ts) during the real OAuth flow.

    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        // Carry dev flag so middleware can allow navigation during local dev if desired
        // @ts-expect-error - custom token field
        token.acceptedTerms = (user as any).acceptedTerms ?? false;
        copyUserFields(token as any, user as any);
        if (IS_DEV && USE_CREDENTIALS_PROVIDER_FOR_DEV_ONLY) {
          // Shortcut in dev so middleware doesn't bounce you around
          // @ts-expect-error - custom token field
          token.acceptedTerms = true;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // @ts-expect-error - augmented session type provided in types/next-auth.d.ts
        session.user.id = token.uid as string;
        // @ts-expect-error - augmented session type provided in types/next-auth.d.ts
        session.user.acceptedTerms = (token as any).acceptedTerms ?? false;
        copyUserFields(session.user as any, token as any);
      }
      return session;
    },
  },
};

// Export only the Edge-safe helper used by middleware.
export const { auth } = NextAuth(edgeAuthConfig);

function copyUserFields(target: Record<string, unknown>, source: Record<string, unknown> | null | undefined) {
  if (!source) return;
  for (const key of SESSION_USER_FIELDS) {
    if (source[key] !== undefined) {
      const value = source[key];
      target[key] = value instanceof Date ? value.toISOString() : value;
    }
  }
}
