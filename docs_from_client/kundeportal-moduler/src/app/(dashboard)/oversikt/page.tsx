import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { complianceOversikt } from "@/lib/compliance/status";

const FARGE = {
  RED: "border-red-300 bg-red-50",
  YELLOW: "border-amber-300 bg-amber-50",
  GREEN: "border-emerald-200 bg-emerald-50",
} as const;
const DOT = { RED: "bg-red-500", YELLOW: "bg-amber-500", GREEN: "bg-emerald-500" } as const;

// Compliance-dashboard: siden daglig leder åpner om morgenen.
export default async function OversiktSide() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/login");
  const { projects, totals } = await complianceOversikt(session.user.organizationId);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">Compliance-oversikt</h1>
      <p className="mb-6 text-sm text-slate-500">Alle aktive prosjekter – forfalte rapporter, kontraktsmål, HMS og masseplan.</p>
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-red-50 p-4 text-center"><p className="text-2xl font-semibold text-red-700">{totals.red}</p><p className="text-xs text-red-600">Krever handling</p></div>
        <div className="rounded-xl bg-amber-50 p-4 text-center"><p className="text-2xl font-semibold text-amber-700">{totals.yellow}</p><p className="text-xs text-amber-600">Følg med</p></div>
        <div className="rounded-xl bg-emerald-50 p-4 text-center"><p className="text-2xl font-semibold text-emerald-700">{totals.green}</p><p className="text-xs text-emerald-600">I orden</p></div>
      </div>
      <div className="space-y-3">
        {projects.map((p) => (
          <Link key={p.projectId} href={`/prosjekter/${p.projectId}`} className={`block rounded-xl border p-4 ${FARGE[p.level]}`}>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${DOT[p.level]}`} />
              <span className="font-medium text-slate-900">{p.projectNumber} {p.name}</span>
            </div>
            {p.issues.length > 0 ? (
              <ul className="mt-2 space-y-0.5 text-sm text-slate-700">{p.issues.map((i, n) => <li key={n}>• {i}</li>)}</ul>
            ) : (
              <p className="mt-1 text-sm text-slate-500">Ingen avvik.</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
