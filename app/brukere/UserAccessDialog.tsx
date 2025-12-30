"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowPathIcon, MinusCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { formatDisplay, formatPhone } from "@/lib/formatters";

type UserAccess = {
  customerId: number;
  role: "admin" | "user" | string;
  customer?: {
    name?: string | null;
    customer_number?: number | null;
  } | null;
};

type UserDetails = {
  id: string;
  name: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
  address_street: string | null;
  address_postal_code: string | null;
  address_region: string | null;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
  acceptedTerms: boolean;
  acceptedTermsAt: string | Date | null;
  accesses?: UserAccess[] | null;
};

type UserAccessDialogProps = {
  userId: string | null;
  initialUser?: Partial<UserDetails> | null;
  onClose: () => void;
  onChanged?: () => void;
};

export default function UserAccessDialog({ userId, initialUser, onClose, onChanged }: UserAccessDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserDetails | null>((initialUser as UserDetails | null) ?? null);
  const [entries, setEntries] = useState<UserAccess[]>(initialUser?.accesses ?? []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    // If we already have sufficient data, skip fetch
    const hasInitial = initialUser && initialUser.id === userId && initialUser.accesses;
    if (hasInitial) {
      setUser((initialUser as UserDetails) ?? null);
      setEntries(initialUser?.accesses ?? []);
      setLoading(false);
      setError(null);
      setSaveError(null);
      setDeleteError(null);
      return;
    }

    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      setSaveError(null);
      setDeleteError(null);
      try {
        const response = await fetch(`/api/users/${userId}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error((payload as { error?: string }).error ?? "Kunne ikke hente bruker");
        }
        if (!active) return;
        const fetchedUser = (payload as { user: UserDetails }).user;
        setUser(fetchedUser);
        setEntries(fetchedUser.accesses ?? []);
      } catch (err) {
        console.error("Failed to fetch user details", err);
        if (!active) return;
        setError(err instanceof Error ? err.message : "Kunne ikke hente bruker");
        setUser(null);
        setEntries([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [userId, initialUser]);

  useEffect(() => {
    if (initialUser && userId && initialUser.id === userId) {
      setUser((prev) => prev ?? (initialUser as UserDetails));
      setEntries((prev) => (prev.length ? prev : initialUser.accesses ?? []));
    }
  }, [initialUser, userId]);

  const normalizedOriginal = useMemo(() => normalizeAccesses(user?.accesses ?? []), [user]);
  const normalizedCurrent = useMemo(() => normalizeAccesses(entries), [entries]);
  const isDirty = useMemo(() => JSON.stringify(normalizedOriginal) !== JSON.stringify(normalizedCurrent), [normalizedOriginal, normalizedCurrent]);

  function toggleRole(customerId: number) {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.customerId === customerId
          ? { ...entry, role: entry.role === "admin" ? "user" : "admin" }
          : entry,
      ),
    );
  }

  function removeEntry(customerId: number) {
    setEntries((prev) => prev.filter((entry) => entry.customerId !== customerId));
  }

  async function handleSave() {
    if (!userId || !isDirty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accesses: normalizedCurrent,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? "Kunne ikke lagre endringer");
      }
      setUser((prev) => (prev ? { ...prev, accesses: entries } : prev));
      onChanged?.();
      router.refresh();
    } catch (err) {
      console.error("Failed to save user accesses", err);
      setSaveError(err instanceof Error ? err.message : "Kunne ikke lagre endringer");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!userId || saving) return;
    const confirmed = window.confirm(
      "Er du sikker? Brukeren vil bli permanent slettet og vil ikke lenger kunne logge inn i portalen.",
    );
    if (!confirmed) return;
    setSaving(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? "Kunne ikke slette bruker");
      }
      onChanged?.();
      router.refresh();
      onClose();
    } catch (err) {
      console.error("Failed to delete user", err);
      setDeleteError(err instanceof Error ? err.message : "Kunne ikke slette bruker");
    } finally {
      setSaving(false);
    }
  }

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bruker</p>
            <h2 className="text-2xl font-semibold text-slate-900">
              {formatDisplay(user?.name, "Ukjent bruker")}
            </h2>
            <p className="text-sm text-slate-500">ID: {userId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Lukk dialog"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {loading ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <ArrowPathIcon className="h-5 w-5 animate-spin text-blue-600" />
              Laster bruker og tilganger...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : (
            <>
              <UserOverview user={user} />
              <UserAccessList
                accesses={entries}
                onToggleRole={toggleRole}
                onRemove={removeEntry}
                isSuperAdmin={user?.role === "super_admin"}
              />
              {saveError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {saveError}
                </div>
              ) : null}
              {deleteError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {deleteError}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!isDirty || saving}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow cursor-pointer ${!isDirty || saving
                    ? "cursor-not-allowed bg-blue-300"
                    : "bg-blue-600 hover:bg-blue-500"
                    }`}
                >
                  {saving ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      Lagrer...
                    </>
                  ) : (
                    "Lagre"
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
                >
                  Slett bruker
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function UserOverview({ user }: { user: UserDetails | null }) {
  if (!user) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Fant ikke brukerdata.
      </div>
    );
  }

  const addressLines = formatAddress(user);
  const infoRows = [
    { label: "Rolle", value: formatRole(user.role) },
    { label: "Telefon", value: formatPhone(user.phone) },
    { label: "E-post", value: formatDisplay(user.email) },
    { label: "Opprettet", value: formatDate(user.createdAt) ?? "-" },
    { label: "Oppdatert", value: formatDate(user.updatedAt) ?? "-" },
    { label: "Vilkår", value: user.acceptedTerms ? "Akseptert" : "Ikke akseptert" },
    { label: "Akseptert dato", value: formatDate(user.acceptedTermsAt) ?? "-" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {infoRows.map((row) => (
          <div key={row.label} className="rounded-lg bg-white px-3 py-2 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {row.label}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">{row.value || "-"}</p>
          </div>
        ))}
        <div className="rounded-lg bg-white px-3 py-2 shadow-sm sm:col-span-2 md:col-span-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Adresse
          </p>
          <div className="mt-1 space-y-0.5 text-sm font-medium text-slate-900">
            {addressLines ? (
              addressLines.map((line, index) => <div key={`address-${index}`}>{line}</div>)
            ) : (
              <span className="text-slate-500">Ikke oppgitt</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UserAccessList({
  accesses,
  onToggleRole,
  onRemove,
  isSuperAdmin,
}: {
  accesses: UserAccess[];
  onToggleRole: (customerId: number) => void;
  onRemove: (customerId: number) => void;
  isSuperAdmin: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Kundetilganger</h3>
        {isSuperAdmin ? null : (
          <span className="text-sm text-slate-500">
            {accesses.length} tilgang{accesses.length === 1 ? "" : "er"}
          </span>
        )}
      </div>

      {isSuperAdmin ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          Som administrator har brukeren tilgang til alle kunder.
        </div>
      ) : accesses.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          Ingen registrerte tilganger for denne brukeren.
        </div>
      ) : (
        <div className="space-y-3">
          {accesses.map((access) => (
            <div key={access.customerId} className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {formatDisplay(access.customer?.name, "Ukjent kunde")}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {access.customer?.customer_number ? (
                      <span>Kundenr {access.customer.customer_number}</span>
                    ) : null}
                    <span>ID: {access.customerId}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleRole(access.customerId)}
                  className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold cursor-pointer ${access.role === "admin"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-blue-200 bg-blue-50 text-blue-800"
                    }`}
                >
                  {formatCompanyRole(access.role)}
                </button>
              </div>
              <button
                type="button"
                onClick={() => onRemove(access.customerId)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-slate-500 hover:text-red-600 cursor-pointer"
              >
                <MinusCircleIcon className="h-5 w-5" />
                Fjern
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatAddress(user: Pick<UserDetails, "address_street" | "address_postal_code" | "address_region">) {
  const lines: string[] = [];
  if (user.address_street) {
    lines.push(user.address_street);
  }

  const postalRegion = [user.address_postal_code, user.address_region]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");

  if (postalRegion) {
    lines.push(postalRegion);
  }

  return lines.length ? lines : undefined;
}

function formatDate(value?: string | Date | null) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${day}.${month}.${year} kl. ${hours}:${minutes}`;
}

function formatRole(role?: string | null) {
  if (!role) return "Ukjent";
  const labels: Record<string, string> = {
    super_admin: "Administrator",
    customer: "Kunde",
  };
  return labels[role] ?? role;
}

function formatCompanyRole(role: string) {
  switch (role) {
    case "admin":
      return "Selskapsadmin";
    case "user":
      return "Selskapsbruker";
    default:
      return role || "Ukjent";
  }
}

function normalizeAccesses(accesses: UserAccess[]) {
  return [...accesses]
    .map((a) => ({
      customerId: a.customerId,
      role: a.role === "admin" ? "admin" : "user",
    }))
    .sort((a, b) => a.customerId - b.customerId);
}
