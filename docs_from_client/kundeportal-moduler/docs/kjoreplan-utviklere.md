# KJØREPLAN – AnleggsPortalen (kundeportal for bygg og anlegg)

> **Til utviklingsteamet.** Denne planen er skrevet for å leses av både mennesker
> og AI. Last opp **hele zip-en** (`kundeportal-moduler.zip`) sammen med denne
> filen i Claude, og be den bygge fase for fase. Koden i zip-en er
> referanseimplementasjon: datamodeller, forretningslogikk og API-ruter er
> ferdig tenkt – dere kobler den på deres miljø, fyller integrasjonspunktene
> (AP-1 til AP-12) og bygger UI-et ferdig.

---

## 0. Slik bruker dere planen med Claude

1. Last opp `kundeportal-moduler.zip` + denne filen i samme samtale.
2. Be Claude: *«Les kjøreplanen. Vi er på fase N – sett opp filene, forklar
   avhengighetene og skriv det som mangler for vårt miljø.»*
3. Bygg **én fase om gangen** og kjør akseptansekriteriene nederst i hver fase
   før dere går videre. Fasene er sortert etter avhengigheter.
4. Alt som er merket **INTEGRASJONSPUNKT** krever tilgang/nøkler fra dere
   (Bjugstad-registeret, telemetrileverandører, Lovdata osv.).
5. Alt som er merket **MÅ VERIFISERES** skal kvalitetssikres av fagperson
   (jurist/miljørådgiver) før produksjon.

---

## 1. Mål og kontekst

**Hvem:** Bjugstad (utleieselskap for anleggsmaskiner) tilbyr portalen til sine
kunder (entreprenører). Portalen er kundens driftsflate; Bjugstads egne
systemer består fra før:

| Eksisterende system | Rolle mot portalen |
|---|---|
| **Utleieregisteret** (leieavtaler + kontraktspriser) | Kilde for leide maskiner, leiestatus (aktiv/registrert/avhentes/historisk) og priser. Portalen viser aldri en leid maskin i «aktiv flåte» uten ACTIVE-avtale. |
| **Kundeoppfølgingsmodulen (Blazor)** | Mottar avrop fra portalen («Innkomne avrop»), utleier setter maskinnr + kontraktspriser og signerer. Se AP-12. |
| **Felt-app** | Innsjekk/RUH/lass/EO fra felt. Portal-API-et i `src/app/api/app/` er laget for denne. |

**Hva portalen skal løse:** prosjektstyring m/ norske kontraktskrav (NS 8405/8407),
AI-drevet rapporteringsoversikt (lov/forskrift/NS/kontrakt), flåte og telemetri
(egne + leide + UE), kart m/ soner og geofence, masse/lasslister m/ CO2,
endringsordre, mannskap/timer, HMS, dokumenthotell m/ avrop, minijurist og
standardbibliotek – med compliance-trafikklys på toppen.

---

## 2. Teknisk fundament

**Stack:** TypeScript · Next.js 15 (App Router) · React 19 · PostgreSQL ·
Prisma · NextAuth (Auth.js) · Tailwind. AI: Anthropic API.

**Zip-struktur:**
```
prisma/schema-tillegg*.prisma   ← 10 delskjemaer, flettes inn i deres schema.prisma
src/lib/<modul>/                ← forretningslogikk (ren TS, testbar)
src/app/api/<rute>/route.ts     ← API-ruter (Next.js route handlers)
docs/integrator-spec.md         ← AP-1..AP-12 med payloads og akseptanse
README.md                       ← kapittel 1–33, modul-for-modul-dokumentasjon
```

**Antakelser om eksisterende basis** (juster importer/relasjoner hvis deres
navn avviker): modellene `Organization`, `User`, `Machine`, `RentalAgreement`
(med `status`, `startDate`, `endDate`), `Project`, `Document`, `Notification`
finnes; NextAuth-session eksponerer `user.id`, `user.organizationId`,
`user.isPortalAdmin`.

**Miljøvariabler:**

| Variabel | Brukes til |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `ANTHROPIC_API_KEY` | All AI (rapportkrav, minijurist, Flåte-AI, rapporttekst) |
| `REPORTING_AI_MODEL` | Modellnavn, f.eks. `claude-sonnet-4-6` |
| `AI_LIMIT_DAILY_PER_USER`, `AI_LIMIT_DAILY_PER_ORG` | Kvoter (se §6) |
| `CRON_SECRET` | Beskytter alle cron-endepunkter |
| `GPS_INGEST_SECRET` | Push-mottak Teltonika/Mictrack (AP-11) |
| `BJUGSTAD_REGISTER_URL`, `BJUGSTAD_REGISTER_API_KEY` | Avrop → registeret (AP-12) |
| `AVROP_WEBHOOK_SECRET` | Webhook retur fra registeret (AP-12) |

---

## 3. Sikkerhet, GDPR og deling

- **Tilgang:** all prosjektdata går gjennom `requireProjectRole` i
  `src/lib/sikkerhet/guard.ts` (roller VIEWER/MEMBER/MANAGER + org-sjekk).
  Admin-funksjoner krever `isPortalAdmin`.
- **AI-kvoter:** `checkAiQuota`/`recordAiUsage` før/etter hvert AI-kall.
- **Audit:** skriv `AuditLog` for opprett/endre/slett på kontrakts- og
  HMS-nære data.
- **Deling (vises som disclaimer i UI, ligger i bunntekst):**
  standarder/dokumenter og AI-samtaler deles automatisk til felles
  kunnskapsbase på tvers av kunder; maskindata/lasslister deles **aldri** uten
  eksplisitt, gjenkallbart samtykke (`DataShareGrant`, brukes for UE-data).
- **GDPR:** posisjonsdata for mannskap er persondata – innsjekk krever
  samtykke, oppbevaring begrenses, innsyn/retting/sletting støttes.
  Feed-poster arkiveres (slettes ikke) – avklar lagringstid med DPO.

---

## 4. Byggerekkefølge (fase 1–14)

### Fase 1 – Fundament og admin-kataloger
- **Schema:** `schema-tillegg.prisma` (basisutvidelser) + `schema-tillegg-5`
  (admin: `MassTypeCatalog` m/ `tonnPerM3`, `ProjectFieldDef` for egendefinerte
  prosjektfelt).
- **Lib/API:** `src/lib/sikkerhet/guard.ts`, `/api/admin/*`.
- **UI:** Admin-fane (kun portaladmin): massetyper (navn, enhet, tonn/m³),
  egendefinerte prosjektfelt.
- **Akseptanse:** ikke-admin får 403 på admin-API; massetype m/ t/m³ kan
  opprettes/slettes; feltdefinisjon dukker opp som påkrevd felt i prosjektoppsett.

### Fase 2 – Prosjektmodul
- **Schema:** prosjektfelter (adresse, kontraktstype NS 8405/8406/8407/8417,
  størrelse NOK, byggherretype offentlig/privat, byggherre m/ adresse/e-post,
  kontaktperson) + `ProjectKpi` (kontraktsmål: MAX_CO2_KG, MAX_IDLE_PCT,
  MIN_ELECTRIC_PCT …) i tillegg 1/6.
- **UI-krav:**
  - Prosjektvelger med **søkefelt** (kunder har 30–40 prosjekter) som matcher
    nummer, navn og byggherre.
  - Prosjektside med underfaner: **Prosjektinfo** (inkl. avvikskort – samme
    avvik som i Oversikten), **Anleggskart** (fase 6), **Masse & lasslister**
    (fase 7), **Dokumenter** (fase 3).
  - «Rediger» åpner full redigering av både prosjektinfo **og** kontraktsmål
    (legg til/fjern mål).
- **Akseptanse:** avvik vises både i Oversikt og på prosjektet; redigering
  lagrer alle felter inkl. egendefinerte; KPI-er evalueres mot livedata med
  status OK / NÆR GRENSE / BRUDD.

### Fase 3 – Dokumenthotell + Avrop
- **Schema:** `schema-tillegg-10-dokumenthotell-avrop.prisma`
  (`DocFolder` m/ kind SYSTEM/PROJECT/CUSTOM, `DocFile`, `CallOff`,
  `CallOffLine`).
- **Lib:** `src/lib/dokumenter/hotell.ts` (seed + mapper),
  `src/lib/avrop/avrop.ts` (hele avropsflyten).
- **Faste mapper (SYSTEM, låst):** Avtaledokumenter (undermapper **Leie
  Bjugstad Utleie**, **Underentreprenører**, **Leverandører**),
  Avropsdokumenter, Kundedokumenter, Andre dokumenter, Prosjektdokumenter.
- **Prosjektmapper:** opprettes fra Dokumenter-fanen (prosjekt velges fra
  **søkbar dropdown** – prosjektet må finnes først) *eller* inne på prosjektet.
  Undermapper arver `projectId` → samme mapper vises begge steder.
- **Avrop (AP-12):** knapp «＋ Nytt avrop» i Avropsdokumenter → linjer
  (beskrivelse, antall, ønsket periode, ev. prosjekt) → «Send til utleier» →
  `POST {BJUGSTAD_REGISTER_URL}/api/avrop` → vises i Blazor-kundemodulen →
  utleier setter maskinnr, **kontraktspriser hentes automatisk fra
  prisregisteret**, utleier signerer → webhook `/api/inbound/avrop-retur` →
  kunden signerer → status **ACTIVE** + bekreftelse pushes tilbake + signert
  PDF arkiveres i Avropsdokumenter.
- **INTEGRASJONSPUNKT:** blob-lagring for filer (S3/Azure), PDF-generering av
  signert avrop, selve mottaket i Blazor-modulen (payload i integrator-spec).
- **Akseptanse:** faste mapper kan ikke slettes/omdøpes; prosjektmappe kan
  ikke opprettes for ikke-eksisterende prosjekt; full avropsrunde ender med
  ACTIVE i begge systemer og PDF i arkivet.

### Fase 4 – GPS/telemetri-inntak (AP-11)
- **Schema:** tillegg 6 (`MachineTelemetrySnapshot`, `MachineTelemetryLink`
  m/ provider-enum inkl. TELTONIKA og MICTRACK).
- **API:** `POST /api/inbound/gps` m/ `x-ingest-secret` – normaliserte
  posisjons-/tenningsmeldinger; IMEI → maskin via `MachineTelemetryLink`;
  tenning på + < 2 km/t ⇒ IDLE; hver posisjon kjøres gjennom sonemotoren
  (fase 6).
- **INTEGRASJONSPUNKT:** parser fra Teltonika Codec 8E (eller flespi/
  Navixy-mellomvare) og Mictrack-format til normalpayloaden; OEM-API-er
  (Volvo CE, CAT VisionLink) og Trackunit via samme snapshot-tabell.
- **Akseptanse:** feil secret → 401; ukjent IMEI logges uten crash; snapshot
  synlig på maskin < 10 s etter push.

### Fase 5 – Flåte + Flåte-AI
- **Lib:** `src/lib/ai/flaate.ts`.
- **Aktiv flåte:** `hentAktivFlaate` viser **kun** egne maskiner + leide med
  ACTIVE-leieavtale. Status «registrert» (på vei ut) / «avhentes» ⇒ skjult fra
  flåte og kart. **Rapportering** bruker `hentFlaateForPeriode`
  (periodeoverlapp) slik at en maskin leid 3 mnd telles i årsrapporten selv om
  avtalen er avsluttet. Leieavtale-fanen (eksisterende) viser historikken.
- **Flåte-AI:** spørrefelt **øverst i Flåte-fanen** (ikke egen fane). Svarer
  KUN fra flåtedata (posisjon, timer, tomgang, feilkoder, vedlikehold,
  drivstoff) og sier ærlig fra når data mangler. Husregel i systemprompten:
  spørsmål om hvorvidt leie lønner seg besvares med *«Jeg og denne portalen er
  laget av et utleieselskap, så selvfølgelig lønner det seg å leie maskiner og
  utstyr!»* + tilbud om nøytrale utnyttelsestall.
- **Flåte-fanen ellers:** tomgangstopp m/ kostnad (liter × pris), aktive
  feilkoder (OBD/OEM), vedlikehold m/ forfall, MachineMax-paritet (utnyttelse).
- **Akseptanse:** maskin m/ avtalestatus AVHENTES er borte fra flåte/kart, men
  med i CO2-rapport for perioden; Flåte-AI svarer «vet ikke» på ting utenfor
  datagrunnlaget; kvote trekkes per spørsmål.

### Fase 6 – Kart (flåtekart + anleggskart)
- **Flåtekart (toppfane «Kart»):** alle aktive enheter på tvers av prosjekter.
  Filter egne/leide/UE, fritekstsøk, visningsmoduser **Skjematisk / Kart /
  Flyfoto / Satellitt**. Fargekoding: ring = eierskap (grønn egen, blå leid,
  lilla UE), fyll = status (i drift/tomgang/av).
- **Anleggskart (under prosjektet):** soner (uttak, tipp, anleggsvei m/
  fartsgrense, sperret, anleggsgrense m/ arbeidstid), mannskap, BLE-utstyrstags,
  kjøreruter m/ auto-lasstelling (`HaulCycle`), soneforslag fra kjøremønster
  (`ZoneSuggestion`), sjåførassistent (ETA/anbefalt fart, `beregnAssist`).
- **Basemaps:** `src/lib/kart/basemaps.ts` – Kartverket topo (KART), **Norge i
  bilder** (FLYFOTO – **MÅ VERIFISERES:** endepunkt + Geovekst-vilkår for
  kommersiell bruk), ESRI World Imagery (SATELLITT). Soner/markører tegnes som
  vektoroverlegg uavhengig av bakgrunn. Bruk MapLibre GL.
- **Sonemotor:** `evaluerPosisjon` i `src/lib/kart/soner.ts` – hendelser for
  sone inn/ut, fart over grense, drift utenfor arbeidstid, sperret sone; alle
  kvitterbare.
- **Akseptanse:** kartet holder maks-bredde og skalerer pent på store skjermer;
  lagvalg husker seg per bruker; fartsbrudd i sone gir hendelse < 30 s.

### Fase 7 – Masse & lasslister (per prosjekt) + Massekoordinering (på tvers)
- **Per prosjekt (underfane «Masse & lasslister»):** massetyper velges fra
  admin-katalogen m/ plan inn/ut; registrering av masse og lass (manuelt, app,
  vekt-API, auto fra GPS-kjøresykluser); tonn ⇄ m³ via katalogens t/m³;
  plan-vs-registrert med varsling ved overskridelse.
- **Massekoordinering (toppfane):** `beregnKoordinering` matcher gjenstående
  plan UT mot plan INN per massetype på tvers av kundens prosjekter, vises som
  piler på kartet + tabell + gevinstestimat (spart deponi/innkjøp/CO2 –
  forutsetninger skal vises).
- **Akseptanse:** match dukker opp når to prosjekter har motsatt restbehov på
  samme massetype; gevinstberegningen viser forutsetningene sine.

### Fase 8 – Rapportering + CO2
- **Scope-velger:** Prosjektrapport (multi-velg prosjekter i **søkbar dropdown**
  – bygget for 30–40 prosjekter, 2–3 kan samles i én rapport) eller
  Firmarapport. Bryter «Inkluder UE/innleide» (default PÅ for prosjektrapport,
  AV for firmarapport). Se `src/lib/rapportering/scope.ts`.
- **Underfaner:** **Rapportkrav** og **CO2-regnskap** (CO2 er IKKE egen
  toppfane).
- **Rapportkrav (AI):** last opp kontraktsdokumenter → AI foreslår krav i tre
  grupper (Lover/forskrifter, NS-standarder, Kontraktspesifikt) m/ intervall,
  mottaker og hjemmel; bruker bekrefter/avviser; per rapport: grønne felter
  (auto fra portalen) + oransje felter (må fylles manuelt); AI genererer
  rapporttekst; status utkast → klar → sendt; forfall overvåkes av cron.
- **CO2-regnskap:** utslippsfaktorer i `src/lib/miljo/co2.ts`
  (**MÅ VERIFISERES:** diesel 2,66 kg/l, HVO 0,35, el 0,019 – sjekk mot
  DFØ/Miljødirektoratet før produksjon). Fordeling egne/leide/UE; historisk
  leide telles via `hentFlaateForPeriode`.
- **Akseptanse:** UE-bryteren endrer tallgrunnlaget synlig; rapport uten
  opplastede kontrakter viser advarsel om at kontraktskrav mangler; kvote og
  forfallsvarsel fungerer.

### Fase 9 – Endringsordre (EO)
- **Schema/lib/API:** `schema-tillegg-9-endringsordre.prisma`,
  `src/lib/eo/endringsordre.ts`, `/api/endringsordre`.
- **Flyt:** felt oppretter **«Mulig endring»** (tittel, beskrivelse, opphav
  – post/beskrivelse/tegning – og bilder) → kontoret vurderer på PC:
  - **ENDRING:** EO-nummer settes, oppretter varsles.
  - **INGEN ENDRING:** årsak påkrevd, oppretter varsles, havner i eget arkiv.
- **Videre på ENDRING:** «Send varsel til byggherre» (**uten ugrunnet
  opphold** – koblet til minijuristens råd), fortløpende logg (lass, timer,
  materialer, dagbok – alle m/ bilder), oppdateringsintervall til byggherre
  (**hver fredag / siste arbeidsdag i måneden / manuelt**) via cron
  `sendPlanlagteOppdateringer`, manuell «send oppdatering nå».
- **Byggherrestatus (settes manuelt):** Ikke varslet · Varslet, ikke mottatt
  svar · Under diskusjon · Akseptert · Delvis akseptert · Delvis avvist ·
  Avvist.
- **Arkiver:** eget arkiv for «Ingen endring» og eget for ferdigstilte EO-er.
- **Akseptanse:** feltbruker får varsel ved begge utfall; EO-nummer er løpende
  per prosjekt; fredags-cron sender kun for EO-er m/ WEEKLY_FRIDAY og varslet
  byggherre.

### Fase 10 – Mannskap & timer
- **Scope:** dropdown m/ søk – ett prosjekt eller **hele selskapet**.
- **Innleide:** `personnelType` EMPLOYEE/HIRED på innsjekk/timeføring; vises
  m/ merke «Innleid»; CSV-eksport (Visma/Tripletex-format,
  `eksporterTimerCsv`) merker HIRED.
- Innsjekk (GPS/QR) → mannskapsliste (byggherreforskriften) + `TimeEntry`
  m/ overtidsberegning; skiftplan per prosjekt.
- **INTEGRASJONSPUNKT (senere):** direkte ERP-push (AP-10).
- **Akseptanse:** «Hele selskapet» aggregerer alle prosjekter; innleide er med
  i mannskapsliste til byggherre, men kan skilles ut i lønnsgrunnlag.

### Fase 11 – HMS
- RUH m/ alvorlighetsgrader; skade m/ fravær trigger banner om varslingsplikt
  (aml. § 5-2: Arbeidstilsynet + byggherre); vernerunder; statistikk mates inn
  i rapporteringskravene.

### Fase 12 – Feed
- Prosjektfeed m/ bilder fra felt; **poster eldre enn 30 dager flyttes
  automatisk til arkiv** (cron, `archivedAt`); arkivet kan åpnes fra fanen.

### Fase 13 – Minijurist + rettskildebase (AP-9)
- **Lib:** `src/lib/ai/minijurist.ts` + seedet domskunnskap
  (entrepriserettslige nøkkelavgjørelser, bl.a. HR-2019-1225-A om
  plunder/heft-beviskrav og lagmannsrettspraksisen etter den).
- **Regler:** alltid «uten ugrunnet opphold»-fokus; anbefal fortløpende
  fakturering av omtvistede krav (rente fra forfall); svar er veiledning, ikke
  rettsråd – disclaimer.
- **Rettskildebase:** KUN referanse + eget sammendrag, **ALDRI fulltekst** fra
  Lovdata/domstolene (opphavsrett/lisens). Web-søk mot åpne kilder
  (lovdata.no gratisdel) for gjeldende lovtekst-referanser.
  **INTEGRASJONSPUNKT:** Lovdata Pro-lisens hvis dypere tilgang ønskes.
- **MÅ VERIFISERES:** alle domsreferanser og juridiske formuleringer
  stikkprøves av advokat før lansering.

### Fase 14 – Standardbibliotek, compliance-oversikt, globalt søk
- **Standardbibliotek:** kundens NS-standarder/forskrifter m/ versjoner;
  varsel når nyere versjon finnes; opplastede dokumenter autodeles til felles
  bibliotek (med disclaimer).
- **Compliance-oversikt (forsiden):** rød/gul/grønn per prosjekt (forfalte
  rapporter, HMS-hendelser, kontraktsmål-brudd, EO-status, masseavvik) –
  samme avviksliste gjenbrukes inne på prosjektet.
- **Globalt søk** i topplinjen: prosjekter, maskiner, ordre/EO, standarder,
  dokumenter.

---

## 5. Integrasjonspunkter (AP-1 … AP-12)

Fullstendige payloads og akseptansekriterier: `docs/integrator-spec.md`.
Kortversjon:

| AP | Hva | Retning |
|---|---|---|
| 1 | Vekt-/veiesystem → lasslister | inn |
| 2 | OEM-telemetri (Volvo CE, CAT VisionLink …) | inn |
| 3 | Trackunit/tredjeparts flåte-API | inn |
| 4 | BLE-gateways for utstyrstags | inn |
| 5 | Regnskaps-/fakturagrunnlag (CSV først) | ut |
| 6 | E-post/varslingstjeneste | ut |
| 7 | Blob-lagring dokumenter/bilder | begge |
| 8 | Kartfliser: Kartverket, **Norge i bilder** (vilkår!), ESRI | inn |
| 9 | Rettskilder (kun referanser, aldri fulltekst) | inn |
| 10 | ERP/lønn (Visma/Tripletex) | ut |
| 11 | **GPS-push Teltonika/Mictrack** → `/api/inbound/gps` | inn |
| 12 | **Avrop ↔ Bjugstad-registeret/Blazor-kundemodulen** | begge |

---

## 6. AI-oppsett

- Ett felles kall-lag mot Anthropic API; modell fra `REPORTING_AI_MODEL`.
- **Kvoter:** per bruker/dag og per org/dag (env), håndheves i
  `checkAiQuota` – vis gjenstående kvote i UI.
- **Systemprompt-prinsipper** (ligger i `src/lib/ai/prompts.ts` og
  `flaate.ts`): svar kun fra gitt kontekst; si ærlig «vet ikke»; norsk,
  konsist; aldri gjengi rettskilde-fulltekst; humor-regelen om leie (fase 5);
  AI-forslag til rapportkrav merkes «AI-forslag» til bruker bekrefter.
- **Senere:** RAG m/ pgvector over kundens dokumenter og fellesbiblioteket.

## 7. Cron-jobber (alle bak `CRON_SECRET`)

| Jobb | Frekvens | Gjør |
|---|---|---|
| Rapportforfall | daglig 06:00 | varsler kommende/forfalte rapporter |
| Telemetri-aggregering | hver time | tomgang/timer-sammendrag, KPI-evaluering |
| EO-oppdateringer | daglig 07:00 | `sendPlanlagteOppdateringer` (fredag / siste arbeidsdag) |
| Feed-arkivering | daglig | `archivedAt` på poster > 30 dager |
| Standardversjon-sjekk | ukentlig | flagg nyere NS-versjoner |

## 8. Test og kvalitetssikring

- **Per fase:** akseptansekriteriene i §4 er minimum. Skriv enhetstester for
  ren lib-logikk (sonemotor, koordinering, EO-datoer, scope-filtre).
- **Juridisk QA før lansering (MÅ VERIFISERES):** minijurist-svar og
  domsreferanser (advokat), utslippsfaktorer (miljørådgiver), Norge i
  bilder/Geovekst-vilkår, GDPR-vurdering av posisjonsdata (DPO),
  disclaimertekster for autodeling.
- **Ende-til-ende-scenario som skal gå grønt:** opprett prosjekt → last opp
  kontrakt → AI-krav → bekreft → rapport sendt; GPS-push → tomgang → KPI-brudd
  → avvik på forsiden; felt-EO → kontor → varsel byggherre → fredagsoppdatering;
  avrop → Blazor → priser tilbake → dobbel signatur → aktivt avrop + PDF.

## 9. Kjente utestående (bevisst utenfor v1)

Brønnøysund-oppslag for UE-kvalifisering · PDF-eksport av rapporter ·
BIM/digital tvilling (fase 2) · innkjøp av sensor-hardware (BLE-tags,
Teltonika-enheter bestilles separat) · direkte ERP-integrasjon (AP-10).

## 10. Ordliste

**Avrop** – bestilling av maskiner under rammeavtale. **EO** – endringsordre.
**RUH** – rapport om uønsket hendelse. **UE** – underentreprenør.
**SHA** – sikkerhet, helse, arbeidsmiljø (byggherreforskriften).
**Lassliste** – digitalt register over transporterte lass (erstatter
veiesedler). **Geofence** – virtuell sonegrense med regelverk.
**Plunder og heft** – vederlagskrav for nedsatt produktivitet pga.
byggherreforhold (to-trinns beviskrav, HR-2019-1225-A).
