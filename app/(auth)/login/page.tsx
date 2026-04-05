// app/(auth)/login/page.tsx
// Purpose: UI to start authentication. In prod it calls signIn("vipps"),
// which sends the user into the Vipps OAuth flow configured in lib/auth.ts.
// In dev it can optionally call signIn("credentials") to skip Vipps.
// After successful auth, NextAuth redirects to `callbackUrl` or /.

"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DEV_BYPASS_USER_NAME,
  DEV_VIPPS_BYPASS_ENABLED,
  IS_DEV,
} from "@/lib/constants";

export default function LoginPage() {
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") || "/";
  const errorParam = search.get("error");
  const emailFromVipps = search.get("email");

  const router = useRouter();
  const { status } = useSession();
  const usesDevBypass = IS_DEV && DEV_VIPPS_BYPASS_ENABLED;

  const [loading, setLoading] = useState(false);
  const [hideError, setHideError] = useState(false);

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
      case "CredentialsSignin":
        return usesDevBypass
          ? `DEV-innlogging mislyktes. Fant ikke ${DEV_BYPASS_USER_NAME}-kontoen som bypass-en forventer.`
          : "Innlogging mislyktes. Prøv igjen.";
      case "UserNotFound":
        return "Vi fant ingen bruker knyttet til kontaktopplysningene dine. Ta kontakt med xxx@bjugstad.no eller din kontoansvarlige for å få brukertilgang før du logger inn igjen.";
      default:
        return "Innlogging mislyktes (" + errorParam + "). Prøv igjen.";
    }
  })();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [status, callbackUrl, router]);

  async function handleLogin() {
    setLoading(true);

    if (usesDevBypass) {
      await signIn("credentials", { callbackUrl });
      return;
    }

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

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full rounded-xl bg-orange-500 py-3 font-medium transition hover:bg-orange-600 disabled:opacity-60 cursor-pointer"
        >
          {loading ? (usesDevBypass ? "Logger inn..." : "Åpner Vipps...") : "Logg inn med Vipps"}
        </button>
      </div>
    </main>
  );
}
