import Link from "next/link";
import ProsjektSkjema from "@/components/prosjekt/ProsjektSkjema";

export default function NyttProsjektSide() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link href="/prosjekter" className="text-sm text-slate-500 hover:text-slate-900">
        ← Prosjekter
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold text-slate-900">Nytt prosjekt</h1>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <ProsjektSkjema />
      </div>
    </div>
  );
}
