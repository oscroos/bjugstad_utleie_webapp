import type { ProjectAnalysisContext } from "@/lib/types";

// Systemprompt: definerer AI-ens rolle og de tre kildene den skal skille på.
export const ANALYSE_SYSTEM_PROMPT = `Du er en norsk fagekspert på rapporteringskrav i bygg- og anleggsprosjekter (HMS, SHA, miljø, kontrakt og myndighetskrav).

Oppgaven din er å kartlegge ALT et prosjekt må rapportere på, og strukturere det. Du skal ALLTID plassere hvert krav i én av tre kilder:

1. LAW  – Norske lover og forskrifter. Bruk din kunnskap om f.eks. byggherreforskriften, internkontrollforskriften, arbeidsmiljøloven, forurensningsloven, avfallsforskriften, byggteknisk forskrift (TEK17) og SHA-krav. Oppgi alltid hjemmel i legalReference (paragraf/forskriftsnavn).

2. NS_STANDARD – Kun de NS-standardene kunden har lagt inn (gis i konteksten). Ikke finn opp standarder som ikke er oppgitt. Referer til punkt/kapittel der du kan.

3. CONTRACT – Kontraktspesifikke krav som fremgår av dokumentene kunden har dratt inn. Baser deg strengt på dokumentteksten. Oppgi hvor i dokumentet kravet står i legalReference.

For HVERT krav skal du angi:
- interval (hvor ofte det skal rapporteres)
- recipientInstance/recipientName (til hvilken instans og person – bruk byggherre/tilsyn/kommune der loven eller kontrakten sier det; la stå tomt hvis ukjent)
- dataFields: hvilke konkrete datapunkter rapporten trenger. For hvert datapunkt MÅ du vurdere om det finnes i portalen:
    * Sett availableInPortal=true og sourceType=PORTAL_MACHINE/PORTAL_AGREEMENT/PORTAL_DOCUMENT hvis dataen finnes blant maskinene/avtalene/dokumentene i konteksten. Bruk sourceRef til å peke på feltet (f.eks. "machine.operatingHours").
    * Sett availableInPortal=false og sourceType=MANUAL_INPUT hvis kunden må legge det inn selv. Bruk note til å si tydelig HVA kunden må skaffe.
- aiConfidence (0–1) og aiRationale (kort begrunnelse/kildehenvisning).

Vær konkret og praktisk. Ikke gjett på tall. Ikke oppgi juridiske råd som fakta – marker usikkerhet i aiRationale. Skriv alt innhold på norsk. Returner resultatet KUN via verktøyet registrer_rapporteringskrav.`;

// Bygger brukermeldingen fra prosjektkonteksten.
export function byggAnalysePrompt(ctx: ProjectAnalysisContext): string {
  const maskiner =
    ctx.machines.length > 0
      ? ctx.machines
          .map(
            (m) =>
              `- ${m.name}${m.type ? ` (${m.type})` : ""} — tilgjengelige felt i portalen: ${
                m.availableFields.join(", ") || "ingen"
              }`
          )
          .join("\n")
      : "(ingen maskiner registrert på prosjektet)";

  const nsStandarder =
    ctx.nsStandards.length > 0
      ? ctx.nsStandards
          .map(
            (s) =>
              `- ${s.standardNo}${s.title ? `: ${s.title}` : ""}${
                s.clause ? ` (punkt ${s.clause})` : ""
              }`
          )
          .join("\n")
      : "(kunden har ikke lagt inn NS-standarder)";

  const dokumenter =
    ctx.contractDocuments.length > 0
      ? ctx.contractDocuments
          .map(
            (d, i) =>
              `--- DOKUMENT ${i + 1}: ${d.fileName} ---\n${d.text.slice(0, 20000)}`
          )
          .join("\n\n")
      : "(ingen kontraktdokumenter dratt inn)";

  const interne =
    (ctx.internalSources ?? []).length > 0
      ? ctx.internalSources.map((s) => `- ${s}`).join("\n")
      : "(ingen interne HMS-/miljødata registrert ennå)";

  return `PROSJEKT
Prosjektnummer: ${ctx.project.projectNumber}
Navn: ${ctx.project.name}
Sted: ${ctx.project.city ?? "ukjent"}
Byggherre: ${ctx.project.clientName ?? "ukjent"}

MASKINER I PORTALEN (mulig automatisk datagrunnlag):
${maskiner}

INTERNE DATAKILDER MED DATA (sett availableInPortal=true og bruk kilden som sourceRef når et rapportfelt dekkes av disse):
${interne}

NS-STANDARDER KUNDEN HAR LAGT INN:
${nsStandarder}

KONTRAKTDOKUMENTER (for CONTRACT-krav – baser deg på teksten):
${dokumenter}

Kartlegg alle rapporteringskrav for dette prosjektet, fordelt på de tre kildene. For hvert krav: angi intervall, mottakerinstans/-person, og datafelt med tydelig markering av hva som finnes i portalen kontra hva kunden må legge inn selv.`;
}
