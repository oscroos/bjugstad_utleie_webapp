// app/(auth)/login/page.tsx
// Purpose: UI to start authentication. In prod it calls signIn("vipps"),
// which sends the user into the Vipps OAuth flow configured in lib/auth.ts.
// In dev it can optionally call signIn("credentials") to skip Vipps.
// After successful auth, NextAuth redirects to `callbackUrl` or /onboarding/complete.
//
// TEST BRUKER TLF: 45938863

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react"; // reads session shaped by callbacks in lib/auth.ts
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react"; // client helper that talks to /api/auth/* (handlers from lib/auth.ts)
import { IS_DEV, USE_CREDENTIALS_PROVIDER_FOR_DEV_ONLY } from "@/lib/constants";

export default function LoginPage() {
  // If middleware redirected here, it'll attach ?callbackUrl=...
  // After completing Vipps, NextAuth will send the user back to this path.
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") || "/avtaler";
  const errorParam = search.get("error");
  const emailFromVipps = search.get("email");

  const router = useRouter();
  const { status } = useSession(); // based on JWT/session produced by lib/auth.ts callbacks

  const [loading, setLoading] = useState(false);
  const [hideError, setHideError] = useState(false);

  // Map NextAuth error codes (error query param) to friendly messages
  const errorMessage = (() => {
    if (!errorParam || hideError) return null;
    switch (errorParam) {
      case "OAuthAccountNotLinked":
        return (
          "E-postadressen (" +
          emailFromVipps +
          ") er allerede knyttet til en eksisterende bruker. Kontakt support for å koble Vipps til kontoen."
        );
      case "AccessDenied":
        return "Tilgang nektet under innlogging. Prøv igjen eller kontakt support.";
      case "Configuration":
        return "Det har oppstått en feil i servertilkoblingen. Prøv å logge inn igjen eller kontakt support.";
      case "OAuthCallback":
      case "OAuthCallbackError":
        return "Noe gikk galt i Vipps-innloggingen. Prøv igjen.";
      case "UserNotFound":
        return "Vi fant ingen bruker knyttet til kontaktopplysningene dine. Ta kontakt med xxx@bjugstad.no eller din kontoansvarlige for å få brukertilgang før du logger inn igjen.";
      default:
        return "Innlogging mislyktes (" + errorParam + "). Prøv igjen.";
    }
  })();

  // If we're already authenticated (session from NextAuth/lib/auth.ts),
  // don't show the login screen—go straight to callbackUrl.
  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [status, callbackUrl, router]);

  // Single login path:
  // - In development (behind a flag), call the Credentials provider to skip Vipps.
  // - Otherwise call the Vipps provider, which triggers the external Vipps OAuth flow.
  async function handleLogin() {
    setLoading(true);

    if (IS_DEV && USE_CREDENTIALS_PROVIDER_FOR_DEV_ONLY) {
      // Dev-only provider configured in lib/auth.ts.
      // This posts to /api/auth/signin/credentials (handled by NextAuth handlers).
      await signIn("credentials", { callbackUrl });
      return;
    }

    // Production path: kick off Vipps OAuth.
    // This posts to /api/auth/signin/vipps, which redirects to Vipps,
    // and Vipps will redirect back to /api/auth/callback/vipps (handlers from lib/auth.ts),
    // which finally lands us on `callbackUrl`.
    await signIn("vipps", { callbackUrl });
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#001a4d] via-[#002c6d] to-[#1c1464] p-6">
      <div className="w-full max-w-md rounded-2xl bg-white/10 backdrop-blur p-8 text-white shadow-xl">
        {errorMessage && (
          <div className="mb-4 rounded-lg bg-red-500/15 ring-1 ring-red-400/40 p-3 text-sm text-red-100">
            <div className="flex items-start gap-2">
              <span className="flex-1">{errorMessage}</span>
              <button
                aria-label="Lukk feil"
                className="cursor-pointer text-red-200 hover:text-white"
                onClick={() => setHideError(true)}
              >
                ×
              </button>
            </div>
          </div>
        )}

        <h1 className="text-2xl font-semibold mb-2">Logg inn</h1>
        <p className="text-sm opacity-80 mb-6">
          Du må logge inn med Vipps før du kan bruke kundeportalen.
        </p>

        {/* Single button: either triggers dev credentials (if enabled) or Vipps OAuth */}
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full rounded-xl bg-orange-500 hover:bg-orange-600 transition py-3 font-medium disabled:opacity-60 cursor-pointer"
        >
          {loading ? "Åpner Vipps…" : "Logg inn med Vipps"}
        </button>
      </div>
    </main>
  );
}
