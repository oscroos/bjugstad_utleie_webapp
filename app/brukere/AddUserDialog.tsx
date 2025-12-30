'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowPathIcon, MinusCircleIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

type RoleOption = "customer" | "super_admin";
type CompanyRole = "selskapsadmin" | "selskapsbruker";
type PhoneCountry = "NO" | "DK" | "SE" | "FI";

type PhoneMeta = {
  code: string;
  flag: string;
  lengthRange: [number, number];
  example: string;
  formatGroups: number[];
};

const PHONE_RULES: Record<PhoneCountry, PhoneMeta> = {
  NO: { code: "+47", flag: "🇳🇴", lengthRange: [8, 8], example: "12 34 56 78", formatGroups: [2, 2, 2, 2] },
  DK: { code: "+45", flag: "🇩🇰", lengthRange: [8, 8], example: "12 34 56 78", formatGroups: [2, 2, 2, 2] },
  SE: { code: "+46", flag: "🇸🇪", lengthRange: [7, 10], example: "070 123 45 67", formatGroups: [3, 3, 2, 2] },
  FI: { code: "+358", flag: "🇫🇮", lengthRange: [8, 10], example: "040 123 45 67", formatGroups: [3, 3, 2, 2] },
};

type CompanyOption = {
  id: number;
  name: string | null;
  organizationNumber: string | null;
};

type Relationship = {
  id: string;
  companyId: string;
  role: CompanyRole;
};

type ToastState = {
  type: "success" | "error";
  message: string;
};

// Generate a stable unique ID without relying on a module-level counter
function createRelationshipId(): string {
  if (typeof window !== "undefined" && window.crypto && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }
  // Fallback for older browsers / environments
  return `relationship-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const defaultRelationship = (): Relationship => ({
  id: createRelationshipId(),
  companyId: "",
  role: "selskapsbruker",
});


export default function AddUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<RoleOption>("customer");
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>("NO");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [relationships, setRelationships] = useState<Relationship[]>([defaultRelationship()]);
  const [errors, setErrors] = useState<{ phone?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);

  const phoneMeta = PHONE_RULES[phoneCountry];

  useEffect(() => {
    const meta = PHONE_RULES[phoneCountry];
    setPhoneNumber((prev) => prev.slice(0, meta.lengthRange[1]));
    setErrors((prev) => ({ ...prev, phone: undefined }));
  }, [phoneCountry]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  function resetForm() {
    setRole("customer");
    setPhoneCountry("NO");
    setPhoneNumber("");
    setRelationships([defaultRelationship()]);
    setErrors({});
    setSubmitting(false);
  }

  function showToast(next: ToastState) {
    setToast(next);
  }

  useEffect(() => {
    console.log("Fetching companies for AddUserDialog");
    let active = true;

    async function loadCompanies() {
      console.log("Loading companies from API");
      try {
        setLoadingCompanies(true);
        const response = await fetch("/api/companies");
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const payload: { companies?: CompanyOption[] } = await response.json();
        if (!active) return;
        setCompanies(payload.companies ?? []);
        setCompaniesError(null);
      } catch (error) {
        console.error("Failed to load companies", error);
        if (!active) return;
        setCompaniesError("Klarte ikke å hente selskapslisten. Prøv igjen senere.");
      } finally {
        if (active) setLoadingCompanies(false);
      }
    }

    loadCompanies();

    return () => {
      active = false;
    };
  }, []);

  function closeDialog() {
    setOpen(false);
    resetForm();
  }

  function validatePhone(): string | undefined {
    const digits = phoneNumber;
    const [min, max] = phoneMeta.lengthRange;
    if (!digits) {
      return "Telefonnummer er påkrevd.";
    }
    if (digits.length < min || digits.length > max) {
      return `Landskode ${phoneMeta.code} krever ${min === max ? `${min}` : `${min}-${max}`} sifre (eksempel: ${phoneMeta.example}).`;
    }
    return undefined;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const phoneError = validatePhone();
    if (phoneError) {
      setErrors({ phone: phoneError });
      return;
    }

    if (showRelationships && relationships.some((rel) => !rel.companyId)) {
      showToast({ type: "error", message: "Velg selskap for alle relasjoner" });
      return;
    }

    setErrors({});
    setSubmitting(true);

    const payload = {
      role,
      phone: `${phoneMeta.code}${phoneNumber}`,
      relationships: showRelationships
        ? relationships
          .filter((rel) => rel.companyId)
          .map((rel) => ({
            companyId: Number(rel.companyId),
            role: rel.role === "selskapsadmin" ? "admin" : "user",
          }))
        : [],
    };

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (result as { error?: string })?.error ?? "Kunne ikke lagre bruker";
        throw new Error(message);
      }

      showToast({ type: "success", message: "Bruker lagret" });
      closeDialog();
      router.refresh();
    } catch (error) {
      console.error("Failed to save user", error);
      const message = error instanceof Error ? error.message : "Kunne ikke lagre bruker";
      showToast({ type: "error", message });
    } finally {
      setSubmitting(false);
    }
  }

  function addRelationship() {
    setRelationships((prev) => [...prev, defaultRelationship()]);
  }

  function updateRelationship(id: string, patch: Partial<Relationship>) {
    setRelationships((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function removeRelationship(id: string) {
    setRelationships((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)));
  }

  const showRelationships = role === "customer";
  const phoneWithinRange = (() => {
    const [min, max] = phoneMeta.lengthRange;
    return phoneNumber.length >= min && phoneNumber.length <= max;
  })();
  const relationshipsComplete = !showRelationships || relationships.every((rel) => !!rel.companyId);
  const canSubmit = !submitting && phoneWithinRange && relationshipsComplete;
  const hasMultipleRelationships = relationships.length > 1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 cursor-pointer"
      >
        <PlusIcon className="h-5 w-5" />
        Legg til bruker
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8">
          <div className="flex w-full max-w-3xl max-h-[90vh] min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Legg til bruker</h2>
                <p className="text-sm text-slate-600">
                  Fyll ut detaljene under for å lagre en ny bruker i databasen.
                </p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                aria-label="Lukk dialog"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form className="flex flex-1 min-h-0 flex-col" onSubmit={handleSubmit}>
              <div className="flex-1 min-h-0 space-y-8 overflow-y-auto px-6 py-6">
                <section className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700" htmlFor="role">
                      Rolle
                    </label>
                    <select
                      id="role"
                      value={role}
                      onChange={(event) => setRole(event.target.value as RoleOption)}
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    >
                      <option value="customer">Kunde</option>
                      <option value="super_admin">Admin</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700" htmlFor="phone">
                      Telefonnummer
                    </label>
                    <div className="mt-2 flex gap-2">
                      <select
                        aria-label="Landskode"
                        value={phoneCountry}
                        onChange={(event) => setPhoneCountry(event.target.value as PhoneCountry)}
                        className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      >
                        {Object.entries(PHONE_RULES).map(([key, meta]) => (
                          <option key={key} value={key}>
                            {`${meta.flag} ${meta.code}`}
                          </option>
                        ))}
                      </select>
                      <input
                        id="phone"
                        type="text"
                        value={formatPhoneDisplay(phoneMeta, phoneNumber)}
                        placeholder={phoneMeta.example}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, "");
                          const trimmed = digits.slice(0, phoneMeta.lengthRange[1]);
                          setPhoneNumber(trimmed);
                        }}
                        className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                    </div>
                    {errors.phone && (
                      <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
                    )}
                  </div>
                </section>

                {showRelationships && (
                  <section className="space-y-4 border-t border-slate-200 pt-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-900">
                        Selskapsrelasjoner
                      </label>
                      <p className="mt-1 text-xs text-slate-500">
                        Legg inn hvilke selskap brukeren skal knyttes til.
                      </p>
                    </div>

                    <div className="mt-2">
                      {/* Header row */}
                      <div
                        className={`hidden gap-3 text-sm font-medium text-slate-700 md:grid ${hasMultipleRelationships
                          ? "md:grid-cols-[2fr_1fr_max-content]"
                          : "md:grid-cols-[2fr_1fr]"
                          }`}
                      >
                        <span>Firmanavn</span>
                        <span>Rolle i selskap</span>
                        {hasMultipleRelationships && (
                          // Zero-height ghost button so third column width matches Fjern,
                          // but without adding vertical space.
                          <div aria-hidden="true" className="h-0 overflow-hidden">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium cursor-pointer"
                            >
                              <MinusCircleIcon className="h-5 w-5" />
                              Fjern
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="mt-2">
                        {relationships.map((rel, index) => (
                          <div
                            key={rel.id}
                            className={`grid gap-3 md:items-center ${hasMultipleRelationships
                              ? "md:grid-cols-[2fr_1fr_max-content]"
                              : "md:grid-cols-[2fr_1fr]"
                              } ${index === 0 ? "" : "mt-4"}`}
                          >
                            <div>
                              <label
                                className="block text-sm font-medium text-slate-700 md:sr-only"
                                htmlFor={`company-${rel.id}`}
                              >
                                Firmanavn
                              </label>
                              <select
                                id={`company-${rel.id}`}
                                value={rel.companyId}
                                onChange={(event) =>
                                  updateRelationship(rel.id, { companyId: event.target.value })
                                }
                                disabled={loadingCompanies || !!companiesError}
                                className="mt-2 w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 md:mt-0"
                              >
                                <option value="">
                                  {loadingCompanies
                                    ? "Laster selskaper…"
                                    : companiesError
                                      ? "Feil ved lasting av selskaper"
                                      : "Velg selskap"}
                                </option>
                                {companies.map((company) => {
                                  const labelParts = [
                                    company.name ?? `Kunde #${company.id}`,
                                    company.organizationNumber
                                      ? `(Org.nr ${company.organizationNumber})`
                                      : "",
                                  ].filter(Boolean);
                                  return (
                                    <option key={company.id} value={String(company.id)}>
                                      {labelParts.join(" ")}
                                    </option>
                                  );
                                })}
                              </select>
                              {companiesError && (
                                <p className="mt-1 text-xs text-red-600">{companiesError}</p>
                              )}
                            </div>

                            <div>
                              <label
                                className="block text-sm font-medium text-slate-700 md:sr-only"
                                htmlFor={`company-role-${rel.id}`}
                              >
                                Rolle i selskap
                              </label>
                              <select
                                id={`company-role-${rel.id}`}
                                value={rel.role}
                                onChange={(event) =>
                                  updateRelationship(rel.id, {
                                    role: event.target.value as CompanyRole,
                                  })
                                }
                                className="mt-2 w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 md:mt-0"
                              >
                                <option value="selskapsadmin">Admin</option>
                                <option value="selskapsbruker">Bruker</option>
                              </select>
                            </div>

                            {hasMultipleRelationships && (
                              <div className="flex items-center justify-end">
                                <button
                                  type="button"
                                  onClick={() => removeRelationship(rel.id)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-slate-500 hover:text-red-600 cursor-pointer"
                                >
                                  <MinusCircleIcon className="h-5 w-5" />
                                  Fjern
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={addRelationship}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 cursor-pointer"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Legg til selskapsrelasjon
                    </button>
                  </section>
                )}
              </div>

              <div className="border-t border-slate-100 px-6 py-4 text-sm text-slate-500">
                <p>
                  Brukeren lagres i databasen når du trykker Lagre.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={closeDialog}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Avbryt
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white shadow hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-400 cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <ArrowPathIcon className="h-5 w-5 animate-spin" />
                        Lagrer...
                      </>
                    ) : (
                      "Lagre"
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 w-80 rounded-xl border px-4 py-3 shadow-lg ${toast.type === "success"
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-red-200 bg-red-50 text-red-800"
            }`}
        >
          <div className="text-sm font-semibold">
            {toast.type === "success" ? "Bruker lagret" : "Kunne ikke lagre"}
          </div>
          <p className="mt-1 text-sm leading-relaxed">{toast.message}</p>
        </div>
      )}
    </>
  );
}

function formatPhoneDisplay(meta: PhoneMeta, digits: string) {
  if (!digits) return "";
  const groups = meta.formatGroups;
  const sections: string[] = [];
  let index = 0;
  for (const size of groups) {
    if (index >= digits.length) break;
    const next = digits.slice(index, index + size);
    sections.push(next);
    index += size;
  }
  if (index < digits.length) {
    sections.push(digits.slice(index));
  }
  return sections.join(" ").trim();
}
