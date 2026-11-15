import { prisma } from "@/lib/prisma";

// Felles rettskildebase (AP-9 del B). Minijuristen lagrer verifiserte funn
// som referanse + kort sammendrag i egne ord + kilde-URL. Aldri fulltekst.
export async function lagreRettskilde(k: {
  reference: string;
  court?: string;
  decidedAt?: Date;
  topics: string[];
  summary: string;   // egne ord, kappes ved 1000 tegn
  sourceUrl?: string;
}) {
  return prisma.legalSourceRef.upsert({
    where: { reference: k.reference },
    update: { topics: k.topics, sourceUrl: k.sourceUrl },
    create: {
      reference: k.reference,
      court: k.court ?? null,
      decidedAt: k.decidedAt ?? null,
      topics: k.topics,
      summary: k.summary.slice(0, 1000),
      sourceUrl: k.sourceUrl ?? null,
    },
  });
}

// Tema-oppslag til minijurist-konteksten (kunnskapsUtdrag). Enkel tekstmatch
// nå; byttes til pgvector-søk når basen vokser.
export async function finnRettskilder(sporsmal: string, maks = 5) {
  const ord = sporsmal.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  if (!ord.length) return [];
  const alle = await prisma.legalSourceRef.findMany({ take: 200, orderBy: { createdAt: "desc" } });
  return alle
    .map((k) => ({ k, score: k.topics.reduce((a, t) => a + (ord.some((o) => t.toLowerCase().includes(o)) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maks)
    .map((x) => ({
      title: x.k.reference + (x.k.court ? " (" + x.k.court + ")" : ""),
      text: x.k.summary + (x.k.sourceUrl ? "\nKilde: " + x.k.sourceUrl : ""),
    }));
}
