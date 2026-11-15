import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import StandardBibliotek from "@/components/standarder/StandardBibliotek";

export default async function StandarderSide() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">Standardbibliotek</h1>
      <p className="mb-6 text-sm text-slate-500">
        Felles bibliotek over standarder og lover. Legg inn som lenke (minimum) eller last opp dokument.
        Systemet varsler når en nyere versjon finnes enn den vi har.
      </p>
      <StandardBibliotek />
    </div>
  );
}
