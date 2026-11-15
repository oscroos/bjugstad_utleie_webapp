import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.REPORTING_AI_MODEL ?? "claude-sonnet-4-6";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface GenererInput {
  requirementTitle: string;
  source: string; // LAW | NS_STANDARD | CONTRACT
  legalReference?: string | null;
  recipientInstance?: string | null;
  recipientName?: string | null;
  periodLabel?: string; // f.eks. "mars 2026"
  // Datafelt med verdier – fra portalen (auto) og fra kunden (manuelt)
  fields: { label: string; value: string; source: "portal" | "manual" }[];
  projectName: string;
  projectNumber: string;
}

const SYSTEM = `Du skriver ferdige, formelle norske rapporttekster for bygg- og anleggsprosjekter. Skriv nøkternt og presist. Bruk kun dataene du får – ikke finn på tall. Hvis et påkrevd felt mangler verdi, skriv «[mangler: <felt>]» så saksbehandler ser hva som gjenstår. Strukturer med kort ingress, deretter de faktiske opplysningene, og til slutt hvem rapporten er stilet til. Ikke bruk markdown-overskrifter – ren tekst egnet for et rapportfelt.`;

/** Genererer rapporttekst. Returnerer ren tekst klar for redigering/innsending. */
export async function genererRapportTekst(input: GenererInput): Promise<string> {
  const feltliste = input.fields
    .map((f) => `- ${f.label}: ${f.value || "(ingen verdi)"} [${f.source === "portal" ? "fra portal" : "oppgitt manuelt"}]`)
    .join("\n");

  const bruker = `Prosjekt: ${input.projectNumber} – ${input.projectName}
Rapport: ${input.requirementTitle}
Kilde/hjemmel: ${input.source}${input.legalReference ? ` (${input.legalReference})` : ""}
Periode: ${input.periodLabel ?? "ikke oppgitt"}
Stiles til: ${input.recipientInstance ?? "ikke oppgitt"}${input.recipientName ? `, v/ ${input.recipientName}` : ""}

Data:
${feltliste || "(ingen data oppgitt)"}

Skriv den ferdige rapportteksten.`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: "user", content: bruker }],
  });

  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  return text;
}
