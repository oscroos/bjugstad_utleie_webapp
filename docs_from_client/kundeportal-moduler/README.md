# Prosjekt- og rapporteringsmodul

To sammenkoblede moduler for kundeportalen, bygget på deres stack (TypeScript, Next.js 15 App Router, React 19, PostgreSQL, Prisma, NextAuth, Tailwind).

Kjerneideen: **prosjektmodulen er sannheten om prosjekter**. Alle andre moduler — rapportering nå, «minijuristen» og «massehåndtering» senere — henter prosjekt fra samme sted via en delt dropdown og et delt datalag. Ingen modul har egen prosjektlogikk.

---

## 1. Integrasjonsrekkefølge

1. **Datamodell** — lim inn `prisma/schema-tillegg.prisma` i deres `schema.prisma`, legg til back-relasjonene nederst i fila på `Organization`/`User`, og kjør:
   ```bash
   npx prisma migrate dev --name prosjekt-og-rapportering
   ```
2. **Hjelpere** — behold deres egne `@/lib/prisma` og `@/lib/auth`. Sjekk at NextAuth-sessionen eksponerer `user.id` **og** `user.organizationId` (se `src/lib/auth.ts` for hvordan).
3. **AI** — installer SDK og sett env:
   ```bash
   npm i @anthropic-ai/sdk
   ```
   ```
   ANTHROPIC_API_KEY=...
   REPORTING_AI_MODEL=claude-sonnet-4-6   # sett gjeldende modell; se docs.claude.com
   ```
4. **Kopier `src/`** inn i prosjektet. Filstrukturen matcher App Router.
5. **Integrasjonspunkter** — fyll ut de tre TODO-ene i `src/lib/rapportering/context.ts` (maskiner + dokumenttekst) og gi `KontraktDokumentImport` deres dokumentvelger.

---

## 2. Prosjektmodul

| Del | Fil |
|-----|-----|
| Datamodell | `Project`, `ProjectParticipant`, `ProjectSubcontractor` |
| Datalag (delt) | `src/lib/prosjekter/queries.ts` |
| API | `src/app/api/prosjekter/**`, `src/app/api/organisasjoner/sok` |
| UI | `src/app/(dashboard)/prosjekter/**`, `src/components/prosjekt/**` |

Kunden kan opprette prosjekt (prosjektnr., adresse, byggherre), legge til **deltakere fra egen organisasjon** og søke opp **andre selskaper i portalen** for å legge dem til som **underentreprenør (UE)**. UE-søket treffer `/api/organisasjoner/sok` og matcher på navn/org.nr, med egen organisasjon ekskludert.

### Det delte koblingspunktet
Ny modul som skal knyttes til prosjekt trenger bare to ting:
```tsx
import ProsjektVelger from "@/components/felles/ProsjektVelger";
import { assertProjectAccess } from "@/lib/prosjekter/queries";

// I UI:
<ProsjektVelger value={projectId} onChange={setProjectId} />

// I API-ruten (tilgangskontroll):
const project = await assertProjectAccess(projectId, session.user.organizationId);
if (!project) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
```
Slik får rapportering, minijuristen og massehåndtering samme prosjektkilde og samme sikkerhet.

---

## 3. Rapporteringsmodul

Skiller rapporteringskrav på **tre kilder** (enum `RequirementSource`):

| Kilde | Hva | Hvordan det fylles |
|-------|-----|--------------------|
| `LAW` | Norske lover og forskrifter | AI-forslag fra fagkunnskap + hjemmel |
| `NS_STANDARD` | NS-standarder | **Kunden legger dem inn selv** (`NsStandardManager`) |
| `CONTRACT` | Kontraktspesifikt | **Kunden drar inn dokumenter**, AI leser dem |

### Dataflyt

```
Kunde velger prosjekt (dropdown)
        │
        ├─ legger inn NS-standarder
        ├─ drar inn kontraktdokumenter
        │
        ▼
   «Kjør AI-analyse»  →  POST /api/rapportering/analyser
        │
        ▼
  context.ts samler:  maskiner (portal) + NS-standarder + dokumenttekst
        │
        ▼
  reporting-analyzer.ts  →  Claude (structured tool output)
        │
        ▼
  For hvert krav lagres:
    • kilde (LAW / NS_STANDARD / CONTRACT)
    • intervall  (hvor ofte)
    • mottakerinstans + person  (til hvem)
    • datafelt, hvert merket:
        availableInPortal=true  → hentes automatisk (maskiner/avtaler/dok)
        availableInPortal=false → kunden må legge inn selv (med AI-merknad)
        │
        ▼
  Krav vises som AI-forslag (status PROPOSED) gruppert på de tre kildene.
  Kunden bekrefter/avviser → «Sett opp rapport».
```

### Hva AI faktisk svarer på (kravet ditt)
- **Foreslår og lister alt som skal rapporteres** → `ReportingRequirement` pr. kilde.
- **Intervaller** → `interval` (`MONTHLY`, `EVENT_BASED`, …).
- **Til hvilken instans og person** → `recipientInstance`, `recipientName`, `recipientEmail`.
- **Setter opp rapporten** → `POST /api/rapportering/rapporter` lager en `Report` og deler datafeltene i «hentes fra portalen» vs «må fylles inn».
- **Hva finnes i portalen vs. hva kunden må levere** → hvert `ReportDataField` har `availableInPortal` + `sourceType` + `note`. I UI vises dette som to bøtter (grønn = portal, oransje = manuelt) på hvert krav.

### Filer
| Del | Fil |
|-----|-----|
| AI-tjeneste | `src/lib/ai/reporting-analyzer.ts`, `src/lib/ai/prompts.ts` |
| Kontekstbygger | `src/lib/rapportering/context.ts` *(3 TODO-integrasjonspunkter)* |
| API | `src/app/api/rapportering/**` (analyser, krav, ns-standarder, kontraktdokumenter, rapporter) |
| UI | `src/app/(dashboard)/rapportering/**`, `src/components/rapportering/**` |

---

## 4. Sikkerhet og antakelser

- All tilgang går via `session.user.organizationId`; en kunde ser bare egne prosjekter og krav.
- AI-krav lagres alltid som `PROPOSED` — de blir aldri aktive før kunden bekrefter. `aiConfidence` og `aiRationale` vises for etterprøvbarhet. Juridiske forslag er hjelp, ikke fasit.
- Eksisterende modeller antas å hete `Organization`, `User`, `Machine`, `RentalAgreement`, `Document`. Juster navn ved behov — koblingene mot maskin-/dokumentmodulen er løse (id-referanser), så rapportering tvinger ingen endringer der.

## 5. Rapportutfylling og AI-generering *(bygget)*

Fra et bekreftet krav: «Sett opp rapport» → åpne rapporten → felter deles i **hentet fra portalen** (grønt, forhåndsutfylt) og **må fylles inn** (oransje). «Generer rapporttekst» kaller AI som skriver ferdig, formell rapporttekst av dataene – manglende felt markeres `[mangler: …]`. Teksten kan redigeres fritt før «Marker som sendt».

| Del | Fil |
|-----|-----|
| AI-generering | `src/lib/ai/report-generator.ts` |
| API | `src/app/api/rapportering/rapporter/[id]/route.ts`, `.../[id]/generer/route.ts` |
| UI | `src/app/(dashboard)/rapportering/rapporter/[id]/page.tsx`, `src/components/rapportering/RapportUtfylling.tsx` |

## 6. Forfallsvarsler *(bygget)*

Beregner neste forfall pr. aktivt krav fra `interval` + `scheduleAnchor` (rene funksjoner i `scheduling.ts`), klassifisert som forfalt / forfaller snart (≤7 dager) / kommende. Vises som panel øverst i arbeidsflaten.

| Del | Fil |
|-----|-----|
| Beregning | `src/lib/rapportering/scheduling.ts` |
| API | `src/app/api/rapportering/forfall/route.ts` |
| UI | `src/components/rapportering/ForfallsVarsler.tsx` |
| Schema | `prisma/schema-tillegg-2-forfall.prisma` (felt på `ReportingRequirement`) |

> For automatiske varsler/e-post: kall forfallslogikken fra en Vercel Cron / scheduled route og send via deres eksisterende e-postoppsett.

## 7. Neste steg
- Gjenbruk `ProsjektVelger` + `assertProjectAccess` når «minijuristen» og «massehåndtering» bygges – da arver de prosjektkilden og sikkerheten gratis.
- Automatisk materialisering av `Report`-utkast ved forfall (cron).
- PDF-eksport av ferdig rapport.

---

## Testversjon

Prototypen (levert i chat som interaktivt artefakt) kjører hele flyten med mockdata og **ekte AI-kall** for analyse og rapportgenerering, så du kan teste UX og AI nå. Selve produksjonskoden over trenger databasen, NextAuth og `ANTHROPIC_API_KEY` for å kjøre i deres miljø.

---

## 8. Felles standardbibliotek *(bygget)*

Delt bibliotek over standarder/lover, ikke bundet til én organisasjon. Hver `Standard` har en `latestKnownVersion` (nyeste publiserte, vedlikeholdt av leverandør/oppslag) og en eller flere `StandardVersion` (dem vi HAR – som lenke eller opplastet dokument).

**Versjonssjekk:** `registry.ts` sammenligner nyeste versjon vi har mot nyeste publiserte og produserer varselet «Vi har tilgjengelig versjon X, mens siste publiserte er versjon Y.» Varselet vises i biblioteket og injiseres i minijuristen, som må nevne det når svaret bygger på standarden. `slaaOppNyesteVersjon()` er integrasjonspunktet for automatisk oppslag mot offisiell kilde (web).

**Deling med samtykke (viktig personvern/opphavsrett):** når en kunde laster opp en versjon, lagres den, men innhold deles til fellesbiblioteket (`SharedKnowledgeDoc`) **kun** hvis kunden aktivt haker av `shareToCommon`. Konfidensielle kontraktdokumenter deles aldri hit. NS-standarder er opphavsrettsbeskyttet – delingsvalget har en tydelig advarsel. Slik vokser fellesbasen uten å lekke konfidensielt materiale på tvers av kunder.

| Del | Fil |
|-----|-----|
| Versjonslogikk | `src/lib/standarder/registry.ts` |
| API | `src/app/api/standarder/**` (list/opprett, versjoner, sjekk) |
| UI | `src/app/(dashboard)/standarder/page.tsx`, `src/components/standarder/StandardBibliotek.tsx` |
| Schema | `prisma/schema-tillegg-3-*.prisma` |

## 9. Minijuristen *(bygget)*

Chat-basert juridisk assistent per prosjekt. Henter prosjekt via `ProsjektVelger`, bruker prosjektets **private** kontraktdokumenter + fellesbibliotekets standarder, og flagger utdaterte versjoner i svaret. Samtaler kan valgfritt (samtykke) berike fellesbasen anonymisert.

| Del | Fil |
|-----|-----|
| AI | `src/lib/ai/minijurist.ts` |
| API | `src/app/api/minijuristen/**` (threads, spor) |
| UI | `src/app/(dashboard)/minijuristen/**`, `src/components/minijurist/MinijuristChat.tsx` |

## 10. Massehåndtering *(bygget)*

Register for masseflyttinger per prosjekt: massetype, klassifisering (rene/forurenset/farlig), volum, opprinnelse, mottak/deponi, transportør, avfallsdeklarering og status. Oppsummering av m³ per klasse. Advarer når forurensede/farlige masser mangler deklarering.

| Del | Fil |
|-----|-----|
| API | `src/app/api/massehandtering/route.ts` |
| UI | `src/app/(dashboard)/massehandtering/**`, `src/components/masse/MasseRegister.tsx` |

> Alle tre modulene arver `ProsjektVelger` + `assertProjectAccess` – samme prosjektkilde og tilgangskontroll som rapportering.

---

## 11. Sikkerhetslag *(bygget – forbedringsrunden)*

`src/lib/sikkerhet/guard.ts` gir tre gjenbrukbare vakter som rutene nå bruker (mønsteret vist i analyse-ruten – kopier til øvrige ruter ved integrasjon):

- **requireProjectRole** – håndhever `ProjectRole` (VIEWER leser, MEMBER registrerer, PROJECT_MANAGER bekrefter/sender, OWNER sletter). Erstatter ren org-sjekk.
- **checkAiQuota + recordAiUsage** – dagskvote per organisasjon per AI-type (env: `AI_LIMIT_ANALYSE` osv.) og input-hash-cache: identisk dokumentsett analyseres ikke to ganger (sparer API-kost).
- **audit** – `AuditLog` med hvem/hva/når for alle vesentlige handlinger, inkl. opplastinger til fellesbasen og bekreftelse av AI-forslag.

## 12. CO2-/miljøregnskap *(bygget)*

`src/lib/miljo/co2.ts` beregner CO2e fra `FuelUsage` (maskinforbruk) + `MassMovement` (transport-km × turer). **Dimensjoner**: sted (by), prosjekt, hele selskapet × egne / leide / UE / egne+leide / alle. Utslippsfaktorer i `EmissionFactor`-tabellen (defaultverdier i koden – **verifiser mot gjeldende offisielle faktorer før ekstern bruk**).

API: `GET /api/miljo/regnskap?scope=ALL&projectId=...` og `POST /api/miljo/forbruk`. UI: `/miljo` (selskap) og `/miljo/[projectId]` med nivå- og eierskapsvelger, fordeling per eierskap/energikilde/prosjekt og største kilder.

## 13. HMS: RUH og vernerunder *(bygget)*

`/hms/[projectId]`: registrer RUH (5 alvorlighetsgrader, varslingsplikt-flagg ved skade m/fravær) og vernerunder. Statistikken mater SHA-rapportens datafelt automatisk – kontekstbyggeren melder nå `hms.ruh`/`hms.vernerunder`/`miljo.forbruk` til AI som interne kilder, så tilhørende felt blir `availableInPortal=true`.

## 14. App-API *(bygget – kontrakten felt-appen bygger mot)*

Portalen er backend, appen er registreringsflate:

- `GET /api/app/config` – prosjekter (med `qrPayload` for QR-scanning), referansedata (massetyper, drivstoff, RUH-typer), synk-innstillinger. Appen cacher denne for offline-bruk.
- `POST /api/app/sync` – **offline-først batch** (maks 200): appen køer registreringer lokalt med klient-generert UUID (`syncId`), sender når nett er tilbake. Idempotens via unique `appSyncId` – re-sending dedupliseres. Delvis suksess per element; appen fjerner kun kvitterte. Typer: `mass`, `ruh`, `safetyRound`, `fuel`. Rollesjekk (MEMBER) per prosjekt.

Anbefalt i appen: GPS-basert prosjektforslag, QR-scanning av `qrPayload`, foto av veieseddel → `receiptPhotoDocId`.

## 15. Cron: forfall *(bygget)*

`GET /api/cron/forfall` (sikret med `CRON_SECRET`): markerer forfalte rapporter `OVERDUE`, oppdaterer `nextDueDate` per aktivt krav, og bygger varselliste (forfalt/≤7 dager) til prosjektleder/eier. E-postutsending er integrasjonspunkt (Resend/SendGrid/SMTP). Vercel-oppsett: `{"crons":[{"path":"/api/cron/forfall","schedule":"0 5 * * *"}]}`.

## 16. Kjente gjenstående anbefalinger

- **RAG for fellesbasen**: bytt rå kontekst-innmating med pgvector-embeddings når `SharedKnowledgeDoc` vokser (arkitekturen er forberedt – teksten ligger allerede strukturert).
- **Brønnøysund-oppslag** i UE-søket (gratis API mot Enhetsregisteret).
- **Juridisk QA** av automatisk deling (GDPR/opphavsrett) – se Disclaimers.
- Rull `requireProjectRole`-mønsteret ut i alle eldre ruter (vist i analyse-ruten).

---

## 17. Admin-del *(bygget)*

`/api/admin/katalog` – kun portaladministrator (dere som leverandør, flagget `isPortalAdmin`):
- **Massetype-katalog** (`MassTypeCatalog`): navn, enhet (m³/tonn), standardklassifisering. Kundene kan aldri endre katalogen – de velger fra den.
- **Egendefinerte prosjektfelt** (`ProjectFieldDefinition`): tekst/tall/dato/valgliste/ja-nei. Vises på alle prosjekter; kundene fyller inn verdier.

## 18. Prosjektoppsett og utvidede felt *(bygget)*

Faste nye felt på `Project`: kontraktstype (NS 8405/8406/8407/8417/annet), kontraktsstørrelse, privat/offentlig byggherre, byggherrens adresse og e-post, prosjektadresse. `PUT /api/prosjekter/[id]/oppsett` lagrer alt samlet: felt, egendefinerte feltverdier, og **massetyper valgt for prosjektet med planlagt mengde INN og UT** (`ProjectMassType`). Valget styrer hva som er valgbart i både portal og felt-app (app-config leser per prosjekt).

## 19. Masse: INN/UT med plan *(bygget)*

`MassMovement` har nå `direction` (IN/OUT), `massTypeId` (katalogkobling) og `unit`. UI-konsept: to knapper – **INN** og **UT** – med dropdown begrenset til prosjektets valgte typer, og oversikt plan vs. registrert per type og retning.

## 20. Minijuristen v2 *(oppgradert)*

Ny systemprompt krever praktisk rådgivning, ikke standardutdrag: rettspraksis (f.eks. HR-2019-1225-A om beviskrav for plunder og heft), konkrete dokumentasjonskrav med frekvens for oversendelse til byggherre, varslingsfrister/preklusjon, og økonomi (fakturering av omtvistede beløp for å sikre forsinkelsesrente fra forfall, og hva varselet bør si om dette). **Web-søk er aktivert** i API-kallet slik at modellen kan verifisere mot Lovdata/rettskilder, med eksplisitt forbud mot fabrikkerte domsreferanser. RAG-utdrag fra fellesbasen tas inn via `kunnskapsUtdrag` når pgvector kobles på.

## 21. CO2/miljø inn i deres eksisterende dashboard

`GET /api/miljo/regnskap` er bevisst et rent JSON-API uten UI-avhengigheter, slik at deres integratorer kan sy tallene rett inn i dashbordet dere allerede har (maskiner, intervaller, rapporteringslengde): kall med `scope`/`projectId`/`city`/`from`/`to` og render `totalKgCo2e`, `byOwnership`, `byFuelType`, `byProject` med egne komponenter. `MiljoDashboard.tsx` kan brukes som referanse eller droppes.

---

## 22. Fremby-paritet *(bygget – del 6)*

Gap-analyse mot fremby.no ga ni mangler. Alle er nå dekket:

| Fremby-funksjon | Vår løsning |
|---|---|
| Maskintelemetri 60+ merker | `MachineTelemetryLink` + connector-lag (`lib/flate/telemetri.ts`) med stubber for Trackunit/Volvo CE/Cat/Komatsu/Scania. Cron `/api/cron/telemetri` henter og normaliserer til `TelemetrySnapshot`. **Anbefalt start: Trackunit Iris API** (aggregator, bredest dekning raskest). |
| Digitale lasslister m/EPD | `LoadTicket` + `/api/lasslister`: vekt, retning, kjøretøy, EPD-referanse og kg CO2e/tonn. Vektsystem-webhook er eget integrasjonspunkt (source=SCALE_API). |
| Tomgangsanalyse | `beregnTomgang`: tomgangsandel + sløst diesel/NOK/CO2e. |
| Kostnadsfordeling maskin→prosjekt | `MachineCostProfile` + `lib/flate/kostnad.ts`: timer×(finans+service)×påslag + drivstoff/energi. |
| Datadrevne kontraktsmål | `ContractKpi` + `/api/kontraktsmaal`: mål (maks CO2, maks tomgang%, min elgrad, maks diesel) evaluert LIVE mot telemetri/CO2 (`lib/flate/kpi.ts`). |
| Massebalanse på tvers | `/api/masse/balanse?groupBy=project|city|org` over MassMovement + LoadTicket. |
| Elektrifiseringsgrad | `beregnElektrifiseringsgrad` (kWh el vs. diesel-kWh-ekvivalent), inn i miljøregnskap og KPI. |
| Datadeling m/samtykke | `DataShareGrant` + `/api/deling`: UE deler valgte scopes (telemetri/lasslister/CO2/HMS) per prosjekt, gjenkallbart. Ingen deling uten aktiv grant. |
| Energikartlegging | `EnergyMeter`/`EnergyReading` (byggestrøm/lading) – API og enøk-rapport er neste steg. |

**Vår differensiering Fremby mangler:** AI-kartlegging av rapporteringskrav, minijuristen, standardbibliotek m/versjonsvarsling, HMS/RUH, kontrakt-AI, admin-styrte felt. Kombinasjonen telemetri + compliance-AI finnes ikke hos noen av dem.

## 23. Compliance-dashboard *(bygget)*

`/oversikt` + `GET /api/compliance`: rød/gul/grønn per aktivt prosjekt på tvers av hele selskapet. Rød: forfalte rapporter, åpne varslingspliktige HMS-hendelser, brutte kontraktsmål. Gul: krav som forfaller ≤7 dager, kontraktsmål nær grensen, masse UT over plan. Sortert med rødt øverst – siden daglig leder åpner om morgenen.

## 24. Integrator-spec

`docs/integrator-spec.md`: åtte arbeidspakker med akseptansekriterier – Trackunit først (bredest dekning), deretter Volvo CE/Cat/Komatsu/Scania, vektsystem-webhook (HMAC + idempotens), prosjektallokering og CO2-innsying i eksisterende dashboard.

## 25. Rettskildebase (AP-9)

Minijuristen lagrer verifiserte rettskildefunn i `LegalSourceRef` – referanse, domstol, tema, **kort sammendrag i egne ord** og kilde-URL. Aldri fulltekst (jf. opphavsrett/Lovdata-praksis); sitering med kildehenvisning er tilstrekkelig og riktig. `finnRettskilder(spørsmål)` mater treff inn i minijurist-konteksten, så basen blir bedre for hver kunde. Lovdata Pro-API som utvidelse for dyp research: se `docs/integrator-spec.md` AP-9. Startinnhold verdt å seede: HR-2019-1225-A, omkampen i Eidsivating (10.12.2020, tidsnære bevis avgjørende), LH-2019-27272.

## 26. MachineMax + Trackunit + Ditio-paritet *(bygget – del 7)*

Kombinert gap-analyse mot machinemax.io, trackunit.com og ditio.app. Nye moduler:

| Funksjon (kilde) | Vår løsning |
|---|---|
| Single pane-kart: maskiner, folk, soner, varsler (MachineMax) | `hentKartData` + `GET /api/kart` – alt i ett kall. Kartside i UI. |
| Sensorer for ukoblede maskiner (MachineMax) | `SensorUnit` – batterisensor-registrering; posisjon/tilstand inn via samme `MachinePosition`-strøm. Hardware-valg = integrasjonspunkt. |
| Soner: fart, forbud, arbeidstid, anleggsgrense (MachineMax/Trackunit) | `SiteZone` + geofence-motor `evaluerPosisjon` → `ZoneEvent` (SPEEDING, ENTERED_NO_GO, OUT_OF_HOURS, LEFT_SITE=tyverivarsel). |
| Småutstyr/redskap-sporing (Trackunit Kin/Spot) | `AssetTag` (BLE-tags) med siste posisjon, kobling til bæremaskin. |
| Digital tilgangsstyring (Trackunit Pass) | `OperatorAccess` (kompetansebevis + gyldighet) + `MachineUnlockEvent`. |
| Vedlikehold fra timetellere (begge) | `MaintenanceTask` + `/api/flate/vedlikehold`; DUE/OVERDUE settes i telemetri-cronen. |
| AEMP/ISO 15143-3-eksport (MachineMax) | `GET /api/flate/aemp` – standardformat for kundenes egne systemer. |
| Aktivitetsbasert timeføring (Ditio Core) | `CrewCheckin` → `genererTimerFraInnsjekk` → `TimeEntry` med fakturagrunnlag-ref (ERP-integrasjon: Visma/Tripletex = AP-10). |
| Mannskap i sanntid + mannskapsliste (Ditio) | `GET /api/mannskap` (innsjekkede nå) – dekker samtidig byggherreforskriftens oversiktsliste. |
| Live feed fra anlegget (Ditio) | `SiteFeedPost` + `/api/feed`. |
| Sjekklister m/kartpunkt og foto (Ditio) | `Checklist` med lat/lng + photoDocIds. |
| Auto-lasstelling fra GPS (Ditio Flow) | `HaulCycle`: LOAD-sone→DUMP-sone detekteres fra posisjonsstrøm (`detekterSykluser`), bekreftes til `LoadTicket` (`bekreftSomLass`) – masseregistrering uten tasting. |
| Flåte-AI «spør flåten» (Trackunit IrisX) | Neste steg: gjenbruk minijurist-mønsteret med flåtedata som kontekst – vi har hele AI-stacken. |

**Ikke bygget (bevisst):** egen sensor-/tag-hardware (kjøpes: Trackunit Raw/Spot/Kin eller MachineMax-sensorer – vi er programvarelaget oppå), sjåførassistent på skjerm i maskin (fase 2, krever nettbrett-app i hytta).

## 27. Dybde-paritet (undersidene) *(bygget – del 8)*

Andre gjennomgang av trackunit.com, ditio.app og machinemax.io – nå produkt-/undersidene:

| Funksjon (kilde) | Vår løsning |
|---|---|
| Feilkoder normalisert på tvers av OEM + maskinhelse (Trackunit) | `MachineFaultCode` (normalisert + original OEM-kode, severity, aktiv/kvittert). Fylles av telemetri-connectorene. |
| Utnyttelsesmål + tomgangsvarsler (Trackunit) | `UtilizationTarget` per org/maskintype; sanntidsvarsel ved sammenhengende tomgang → `Notification`. |
| Automatisk site-deteksjon (Trackunit) | `finnProsjektForMaskin` utvides: utleieavtale først, deretter geofence mot SITE_BOUNDARY-soner (integrasjonspunkt dokumentert i telemetri.ts). |
| Globalt søk (Trackunit Manager) | `GET /api/sok` – prosjekter, arbeidsordre, tags, sjekklister (utvid med maskiner/dokumenter). |
| QR-onboarding + inspeksjon fra mobil (Trackunit Go) | Finnes: qrPayload i app-config + Checklist; `ChecklistTemplate` (org- og portalmaler) lagt til. |
| Auto-opprettede laste-/tippsteder (Ditio Flow) | `foreslaaSoner`: klynger av stopp-punkter → `ZoneSuggestion`, bekreftes til SiteZone. Kjøres i telemetri-cron. |
| Omregningsformler per massetype (Ditio Flow) | `tonnPerM3` + `swellFactor` på MassTypeCatalog – volum↔vekt automatisk i lass/masse/CO2. |
| Sjåførassistent: ETA + fartsanbefaling, just-in-time (Ditio Flow) | `beregnAssist` + `GET /api/flow/assist` – senk farten fremfor tomgang i kø. Felt-appen viser. |
| Hellingprofilering av anleggsveier (Ditio Flow) | `RoadSegmentProfile` + `vurderHelling` (>12 % flagges). |
| Skiftplanlegging (Ditio Core) | `Shift` + `/api/skift`. |
| Automatisk overtidsberegning (Ditio Core) | `beregnOvertid` (justerbar normaltid) – inn i timeoversikt/eksport. |
| Lønns-/kostnadseksport (Ditio Core: Visma/Tripletex m.fl.) | `eksporterTimerCsv` + `GET /api/eksport?type=timer` (CSV). ERP-API-push = **AP-10** i integrator-spec. |
| Arbeidsordre mot kontraktsposter m/avviksfanging (Ditio Core) | `WorkOrder` + `/api/arbeidsordre` – avvik flagges automatisk når fremdrift > estimat. |
| Push-varsler/infosenter (Ditio Core) | `Notification`-kø; utsending (push/e-post) er integrasjonspunkt. Feed finnes fra del 7. |
| Excel/Power BI/BIM-tilgang (Ditio Core) | Alle GET-API-er er rene JSON (Power BI-konsumerbare); CSV-eksport; BIM-kobling (Novorender/Trimble) = fase 2-integrasjon. |
| Haul-sykler, cycle times, indikativ nyttelast (MachineMax) | Finnes fra del 6/7 (HaulCycle, payloadTonnes); ruteanalyse bygger på samme data. |
| Digital twin / site design-optimalisering (MachineMax) | Bevisst fase 2 – krever 3D-modellgrunnlag. |

## 28. Egne GPS-enheter: Teltonika + Mictrack *(bygget)*

Push-basert mottak `POST /api/inbound/gps` (delt hemmelighet, IMEI→maskin via MachineTelemetryLink). Teltonika FMC m/CAN gir drivstoff/timer i tillegg til posisjon; Mictrack dekker posisjon/ignition på enklere utstyr. Tomgang = ignition + <2 km/t. Se AP-11.

## 29. Rapporteringsscope: flere prosjekter + UE av/på *(del 9)*

`ReportScope` (src/lib/rapportering/scope.ts): en rapport kan gjelde ett prosjekt, flere prosjekter samlet, eller hele selskapet. `includeSubcontractors` styrer om UE/innleide er med i tallgrunnlaget (drivstoff, timer, lass): normalt PÅ i prosjektrapporter til byggherre, AV i firmarapporter. `ownershipFilter(scope)` gjenbrukes i CO2-/telemetri-/lasslistespørringene. UI: prosjekt-multivelger + UE-bryter i rapporteringsfanen; flåtekartet (alle maskiner, filter egne/leide/UE, søk på maskinnr) er toppnivå, anleggskartet m/soner ligger under prosjektet.

## 30. Flåte-AI *(del 9)*

«Spør flåten din om hva som helst» (Trackunit IrisX-paritet): `spoerFlaaten` samler kompakt flåtekontekst (maskiner, telemetri-summer, aktive feilkoder, forfalt vedlikehold, siste posisjoner) og svarer KUN på grunnlag av dataene – med ærlig «vet ikke» når data mangler. Samme kvote-/historikk-mønster som minijuristen. `POST /api/flaate-ai`. Typiske spørsmål: «Hvilke maskiner har mest tomgang?», «Hva må på service?», «Lønner de leide maskinene seg?», «Hvor er M-1042?».

## 31. Bakgrunnskart: kart / flyfoto / satellitt *(del 9)*

`src/lib/kart/basemaps.ts`: begge kartvisninger støtter vektorkart, **flyfoto** (Norge i bilder – skarpest, sjekk Kartverket/Geovekst-vilkår for kommersiell bruk) og **satellitt** (ESRI/Sentinel – ferskest). Soner, maskiner og mannskap tegnes som overlegg uavhengig av bakgrunn.

## 32. Del 9: EO, massekoordinering, aktiv flåte, feed-arkiv, mannskapsscope

**Endringsordre** (erstatter «arbeidsordre» i UI): felt oppretter «mulig endring» (beskrivelse+foto) → kontor vurderer på PC → CHANGE (EO-nr, felt varsles) eller NO_CHANGE m/årsak (felt varsles, eget arkiv). Varsel til byggherre («uten ugrunnet opphold»), fortløpende logg (lass/timer/materialer/dagbok m/bilder + referanse til post/beskrivelse) og periodiske oppdateringer etter valgt intervall (fredager / siste arbeidsdag i mnd / manuelt) via `sendPlanlagteOppdateringer` i cron. Byggherrestatus: ikke varslet, varslet uten svar, under diskusjon, akseptert, delvis akseptert, delvis avvist, avvist. Ferdige EO-er i eget arkiv.

**Massekoordinering**: `beregnKoordinering` matcher gjenstående plan UT mot plan INN per massetype på tvers av prosjekter (`GET /api/masse/koordinering`) – vises på kart i UI.

**Aktiv flåte**: kart/flåte viser kun egne + aktivt leide; «registrert»/«avhentes» skjules. Rapportering bruker `hentFlaateForPeriode` (periodeoverlapp) så historisk leide teller i f.eks. års-CO2. **Feed-arkiv**: cron flytter poster >30 dager. **Mannskap**: scope prosjekt/selskap, personnelType EMPLOYEE/HIRED. **Flåte-AI**: spørrefelt øverst i Flåte (ikke egen fane) + husregel om leie-lønnsomhet. **CO2** inn under Rapportering. **Masse+lasslister** samlet under Prosjekt; toppfanen Massekoordinering viser tvers-bildet.

## 33. Dokumenthotell + Avrop *(del 10)*

**Dokumenthotell** (`src/lib/dokumenter/hotell.ts`): faste hovedmapper Avtaledokumenter (m/underliggende «Leie Bjugstad Utleie», «Underentreprenører», «Leverandører»), Avropsdokumenter, Kundedokumenter, Andre dokumenter og Prosjektdokumenter. Prosjektmapper kan opprettes fra Dokumenter-fanen (prosjekt velges fra søkbar dropdown – prosjektet må finnes først) eller inne på prosjektet; samme mapper vises begge steder (delt `projectId`).

**Avrop** (`src/lib/avrop/avrop.ts`, AP-12): kunden fyller ønskede maskiner → «Send til utleier» pusher til Bjugstad-registeret og dukker opp i kundeoppfølgingsmodulen (Blazor). Utleier setter maskinnummer, kontraktspriser hentes automatisk fra prisregisteret, utleier signerer → webhook tilbake → kunden signerer → **Aktive avrop**. Signert PDF arkiveres i Avropsdokumenter.
