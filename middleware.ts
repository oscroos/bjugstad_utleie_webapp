// middleware.ts
// Purpose: Gate your app’s routes. Uses NextAuth session (via `auth()` from lib/auth.ts)
// which is configured with the Vipps provider. If no session, redirect to /login
// (NextAuth will use the Vipps flow when the user clicks the login button).

import { NextResponse } from "next/server";
// Use Edge-safe auth to avoid bundling Prisma/native binaries in middleware
import { auth } from "@/lib/auth-edge";
import { LATEST_TERMS_VERSION } from "@/lib/constants";

export async function middleware(req: Request) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Allow static assets, Next internals, and NextAuth endpoints to pass through.
  // NOTE: We must not intercept /api/auth/* because that's where NextAuth (and Vipps callbacks) run.
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(?:png|jpg|jpeg|svg|gif|ico|css|js|map|pdf|txt|woff2?|ttf|eot)$/i.test(pathname) ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // Reads the session from NextAuth using the JWT/cookies
  // `auth()` is created by NextAuth(authConfig) in lib/auth.ts and
  // reflects whatever provider was used (Vipps in prod, Credentials in dev).
  const session = await auth();

  const acceptedLatestTerms =
    session?.user?.acceptedTerms === true &&
    session?.user?.acceptedTermsVersion === LATEST_TERMS_VERSION;
  const hasLoggedInBefore = Boolean(session?.user?.lastLoginAt);
  const needsOnboarding = Boolean(session) && (!acceptedLatestTerms || !hasLoggedInBefore);

  if (needsOnboarding) {
    if (!pathname.startsWith("/onboarding") && !pathname.startsWith("/api/auth") && !pathname.startsWith("/api/onboarding")) {
      return NextResponse.redirect(new URL("/onboarding", url.origin));
    }
  }

  // If user is already authenticated and opens /login manually,
  // send them to the intended callback (or /avtaler).
  if (session && pathname === "/login") {
    const target = url.searchParams.get("callbackUrl") || "/avtaler";
    return NextResponse.redirect(new URL(target, url.origin));
  }

  // Public routes: allow login and onboarding steps without a session.
  // The onboarding flow starts a Vipps sign-in and then lands on /onboarding/complete.
  if (pathname.startsWith("/login") || pathname.startsWith("/onboarding")) {
    return NextResponse.next();
  }

  // Everything else requires auth: if no session, redirect to /login and
  // pass the current path as callbackUrl so NextAuth returns here after Vipps completes.
  if (!session) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

// Scope middleware to everything except static/Next internals/NextAuth endpoints.
// This prevents breaking the Vipps OAuth callback handled by /api/auth/*.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/auth|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|ico|css|js|map|pdf|txt|woff|woff2|ttf|eot)$).*)",
  ],
};
