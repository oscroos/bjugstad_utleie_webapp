// app/(auth)/onboarding/page.tsx
"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import TermsDialog from "@/components/TermsDialog";
import { LATEST_TERMS_VERSION } from "@/lib/constants";

type CompanyInfo = {
    customerId: number;
    companyName: string | null;
    organizationNumber: string | null;
    role: string;
};

type ProfileResponse = {
    user: {
        id: string;
        name: string | null;
        email: string | null;
        phone: string | null;
        role: string;
        address_street: string | null;
        address_postal_code: string | null;
        address_region: string | null;
        acceptedTerms: boolean;
        acceptedTermsVersion: string | null;
        lastLoginAt: string | null;
    };
    companies: CompanyInfo[];
    termsVersion: string;
};

export default function OnboardingPage() {
    const { status, update } = useSession();
    const router = useRouter();

    const [profile, setProfile] = useState<ProfileResponse | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [accepted, setAccepted] = useState(false);
    const [showTerms, setShowTerms] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hideError, setHideError] = useState(false);

    useEffect(() => {
        if (status === "loading") return;
        if (status === "unauthenticated") router.replace("/login");
    }, [status, router]);

    const loadProfile = useCallback(async () => {
        if (status !== "authenticated") return;
        setLoadingProfile(true);
        setError(null);
        setHideError(false);
        try {
            const res = await fetch("/api/onboarding", { cache: "no-store" });
            if (!res.ok) {
                throw new Error("Kunne ikke hente brukerdata");
            }
            const data = (await res.json()) as ProfileResponse;
            setProfile(data);
        } catch (err) {
            console.error("Onboarding: GET /api/onboarding failed", err);
            setError("Kunne ikke hente brukerdata. Prøv igjen.");
        } finally {
            setLoadingProfile(false);
        }
    }, [status]);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        setHideError(false);

        const res = await fetch("/api/onboarding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ acceptedTermsVersion: LATEST_TERMS_VERSION }),
        });

        if (res.ok) {
            const nowIso = new Date().toISOString();
            await update({
                acceptedTerms: true,
                acceptedTermsVersion: LATEST_TERMS_VERSION,
                lastLoginAt: nowIso,
            });
            router.replace("/avtaler");
            router.refresh();
        } else {
            setError("Kunne ikke lagre bekreftelsen. Prøv igjen.");
            setSubmitting(false);
        }
    }

    const canSubmit = accepted && !submitting && !loadingProfile && Boolean(profile);

    const companies = profile?.companies ?? [];
    const hasCompanies = companies.length > 0;

    const formattedAddress = useMemo(() => {
        if (!profile) return "Ikke oppgitt";
        const parts = [profile.user.address_street, [profile.user.address_postal_code, profile.user.address_region].filter(Boolean).join(" ")]
            .map((part) => part?.trim())
            .filter(Boolean);
        return parts.length ? parts.join(", ") : "Ikke oppgitt";
    }, [profile]);

    const roleLabel = useMemo(() => {
        if (!profile) return "—";
        return profile.user.role === "super_admin" ? "Administrator" : "Bruker";
    }, [profile]);

    return (
        <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#001a4d] via-[#002c6d] to-[#1c1464] p-6">
            <div className="w-full max-w-2xl rounded-2xl bg-white/10 backdrop-blur p-8 text-white shadow-xl">
                {error && !hideError && (
                    <div className="mb-4 rounded-lg bg-red-500/15 ring-1 ring-red-400/40 p-3 text-sm text-red-100">
                        <div className="flex items-start gap-2">
                            <span className="flex-1">{error}</span>
                            <button
                                aria-label="Lukk feil"
                                className="cursor-pointer text-red-200 hover:text-white"
                                onClick={() => setHideError(true)}
                                type="button"
                            >
                                ×
                            </button>
                        </div>
                        {loadingProfile ? null : (
                            <button
                                type="button"
                                onClick={loadProfile}
                                className="mt-3 inline-flex items-center rounded-md bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20 cursor-pointer"
                            >
                                Prøv igjen
                            </button>
                        )}
                    </div>
                )}

                <h1 className="text-2xl font-semibold mb-2">Velkommen</h1>
                <p className="text-sm opacity-80 mb-6">
                    Vi viser informasjonen vi har registrert på kontoen din. Bekreft at du godtar vilkårene før du fortsetter.
                </p>

                <section className="rounded-xl border border-white/15 bg-white/5 p-4 mb-6">
                    {loadingProfile ? (
                        <div className="animate-pulse space-y-3">
                            <div className="h-4 w-32 rounded bg-white/20" />
                            <div className="h-4 w-48 rounded bg-white/20" />
                            <div className="h-4 w-52 rounded bg-white/20" />
                        </div>
                    ) : profile ? (
                        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                            <InfoField label="Navn" value={profile.user.name || "Ikke oppgitt"} />
                            <InfoField label="Telefon" value={profile.user.phone || "Ikke oppgitt"} />
                            <InfoField label="E-post" value={profile.user.email || "Ikke oppgitt"} />
                            <InfoField label="Rolle" value={roleLabel} />
                            <InfoField label="Adresse" value={formattedAddress} className="sm:col-span-2" />
                        </dl>
                    ) : (
                        <p className="text-sm opacity-80">Kan ikke hente brukerdata akkurat nå.</p>
                    )}
                </section>

                <section className="rounded-xl border border-white/15 bg-white/5 p-4 mb-6">
                    <header className="mb-3">
                        <h2 className="text-lg font-semibold">Tilknyttede selskaper</h2>
                        <p className="text-sm opacity-80">Du kan være knyttet til flere kunder med ulike rettigheter.</p>
                    </header>
                    {loadingProfile ? (
                        <div className="space-y-2">
                            <div className="h-4 w-full rounded bg-white/20" />
                            <div className="h-4 w-4/5 rounded bg-white/10" />
                        </div>
                    ) : hasCompanies ? (
                        <ul className="space-y-3">
                            {companies.map((company) => (
                                <li key={company.customerId} className="rounded-lg border border-white/15 bg-white/5 px-4 py-3">
                                    <p className="text-base font-medium">{company.companyName ?? "Ukjent selskap"}</p>
                                    <p className="text-xs opacity-80">
                                        Org.nr: {company.organizationNumber ?? "N/A"} · Rolle: {company.role === "admin" ? "Administrator" : "Bruker"}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm opacity-80">Ingen selskaper er knyttet til kontoen din ennå.</p>
                    )}
                </section>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <label className="flex items-start gap-3 text-sm leading-5">
                        <input
                            type="checkbox"
                            checked={accepted}
                            onChange={(e) => setAccepted(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-white/40 bg-white/10 text-orange-500 focus:ring-orange-400 cursor-pointer"
                        />
                        <span className="opacity-90">
                            Jeg godtar {" "}
                            <button
                                type="button"
                                onClick={() => setShowTerms(true)}
                                className="underline underline-offset-2 hover:text-white cursor-pointer"
                            >
                                vilkår og betingelser (versjon {LATEST_TERMS_VERSION})
                            </button>
                            .
                        </span>
                    </label>

                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className="w-full rounded-xl bg-orange-500 hover:bg-orange-600 transition py-3 font-medium disabled:opacity-60 disabled:hover:bg-orange-500 cursor-pointer"
                    >
                        {submitting ? "Lagrer…" : "Fortsett"}
                    </button>
                </form>

                <TermsDialog open={showTerms} onClose={() => setShowTerms(false)} />
            </div>
        </main>
    );
}

function InfoField({ label, value, className = "" }: { label: string; value: ReactNode; className?: string }) {
    return (
        <div className={className}>
            <dt className="text-xs uppercase tracking-wide text-white/70">{label}</dt>
            <dd className="mt-1 text-base">{value}</dd>
        </div>
    );
}
