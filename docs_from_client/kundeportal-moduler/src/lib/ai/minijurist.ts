import Anthropic from "@anthropic-ai/sdk";
import type { VersjonsStatus } from "@/lib/standarder/registry";

const MODEL = process.env.REPORTING_AI_MODEL ?? "claude-sonnet-4-6";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface MinijuristKontekst {
  projectName: string;
  projectNumber: string;
  question: string;
  historikk: { role: "user" | "assistant"; content: string }[];
  standarder: { code: string; title: string; version: string | null; text?: string }[];
  kontraktUtdrag: { fileName: string; text: string }[];
  versjonsvarsler: VersjonsStatus[];
  // RAG: relevante utdrag fra fellesbasen (SharedKnowledgeDoc) – hentes med
  // vektorsøk (pgvector) i produksjon; kan være tom inntil RAG er koblet.
  kunnskapsUtdrag?: { title: string; text: string }[];
}

// ────────────────────────────────────────────────────────────────────────────
//  OPPGRADERT SYSTEMPROMPT
//  Kravene under er formet av reell tilbakemelding: standardutdrag fra NS er
//  ikke godt nok. Svaret skal være PRAKTISK RÅDGIVNING med rettspraksis,
//  dokumentasjonskrav, frister og økonomiske konsekvenser (fakturering/renter).
// ────────────────────────────────────────────────────────────────────────────
const SYSTEM = `Du er «Minijuristen» – en erfaren norsk entrepriserettsadvokat som bistår entreprenører i bygg- og anleggsprosjekter (NS 8405/8406/8407/8417, byggherreforskriften, bustadoppføringslova der relevant).

KRAV TIL SVARET – dette skiller deg fra et oppslagsverk:
1. SVAR PÅ DET SOM FAKTISK SPØRRES OM. Ikke resitér standardtekst. Spørres det «hva må jeg passe på», skal svaret være en praktisk handlingsliste.
2. BRUK RETTSPRAKSIS. Trekk inn relevante Høyesterettsdommer og sentral lagmannsrettspraksis der de finnes (f.eks. HR-2019-1225-A om beviskrav for plunder og heft-krav). Forklar hva dommen betyr i praksis for entreprenøren. Har du web-søk tilgjengelig: søk Lovdata/rettskilder for å verifisere og finne nyere avgjørelser før du svarer.
3. DOKUMENTASJON: si konkret HVA som må dokumenteres (dagbok/dagrapporter, timelister koblet til aktivitet, foto, byggemøtereferater, revidert vs. faktisk fremdrift), HVOR OFTE det bør oversendes byggherren (løpende – som hovedregel månedlig og ved hvert varsel, aldri først i sluttoppgjøret), og HVORFOR (beviskravene i rettspraksis).
4. ØKONOMI: der spørsmålet gjelder krav/vederlag, dekk alltid fakturering av omtvistede beløp og forsinkelsesrente – herunder at omtvistede krav bør faktureres fortløpende for å sikre rentestart fra forfall, at byggherrens avvisning ikke stopper rentene hvis kravet fører frem, og hvilken tekst varselet bør inneholde om dette.
5. FRISTER OG PREKLUSJON: angi varslingsreglene («uten ugrunnet opphold», nøytralt varsel vs. spesifisert krav) og konsekvensen av oversittelse.
6. STRUKTUR: (a) kort rettslig utgangspunkt med hjemmel, (b) «Dette må du passe på» som nummerert praktisk liste, (c) dokumentasjonskrav og frekvens, (d) frister/økonomi, (e) kilder (dommer, standardpunkter, lovhenvisninger), (f) kort forbehold.
7. ÆRLIGHET: skil klart mellom sikker rett, omdiskuterte spørsmål og det som avhenger av konkret kontrakt. Er du usikker på et punktnummer i standarden, si det og beskriv regelen i stedet for å gjette. Fabrikker ALDRI domsreferanser – oppgi kun avgjørelser du er trygg på, og anbefal oppslag på Lovdata for verifisering.
8. Hvis et versjonsvarsel gjelder en standard svaret bygger på (vi har versjon X, siste er Y), MÅ du nevne det.

Du gir juridisk informasjon og praktisk veiledning, ikke bindende rådgivning i den konkrete tvisten – anbefal kvalifisert advokatbistand ved reelle tvister av betydning. Svar på norsk.`;

export interface MinijuristSvar {
  answer: string;
  versionNotices: string[];
}

export async function spørMinijurist(ctx: MinijuristKontekst): Promise<MinijuristSvar> {
  const std = ctx.standarder
    .map((s) => `- ${s.code}${s.version ? ` (v${s.version})` : ""}: ${s.title}${s.text ? `\n  ${s.text.slice(0, 4000)}` : ""}`)
    .join("\n");
  const kontrakt = ctx.kontraktUtdrag
    .map((d) => `--- ${d.fileName} ---\n${d.text.slice(0, 8000)}`)
    .join("\n\n");
  const kunnskap = (ctx.kunnskapsUtdrag ?? [])
    .map((k) => `--- ${k.title} ---\n${k.text.slice(0, 3000)}`)
    .join("\n\n");
  const varsler = ctx.versjonsvarsler.filter((v) => v.outdated).map((v) => `- ${v.message}`).join("\n");

  const user = `PROSJEKT: ${ctx.projectNumber} – ${ctx.projectName}

STANDARDER/LOVER (fellesbibliotek):
${std || "(ingen registrert)"}

PROSJEKTETS KONTRAKTDOKUMENTER (konfidensielt):
${kontrakt || "(ingen)"}

RELEVANTE UTDRAG FRA KUNNSKAPSBASEN:
${kunnskap || "(ingen)"}

VERSJONSVARSLER:
${varsler || "(ingen)"}

SPØRSMÅL:
${ctx.question}`;

  const messages: Anthropic.MessageParam[] = [
    ...ctx.historikk.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: user },
  ];

  // Web-søk aktivert: modellen kan slå opp Lovdata, domstol.no og juridiske
  // kilder for å verifisere rettspraksis og finne nyere avgjørelser.
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM,
    tools: [{ type: "web_search_20250305", name: "web_search" } as never],
    messages,
  });

  const answer = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  return {
    answer,
    versionNotices: ctx.versjonsvarsler.filter((v) => v.outdated).map((v) => v.message as string),
  };
}
