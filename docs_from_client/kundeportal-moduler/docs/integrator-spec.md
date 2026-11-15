# Integrator-spec: telemetri og vektsystem
Arbeidspakker for integratorene. Portalen er ferdig forberedt – alle modeller,
normalisering og cron finnes. Jobben er å fylle connector-stubbene med ekte API-kall.

## AP-1: Trackunit Iris API (START HER)
**Hvorfor først:** aggregator som dekker mange merker (Volvo, Cat, Komatsu m.fl.
via Trackunit-enheter) – bredest dekning med én integrasjon.
- Fil: `src/lib/flate/telemetri.ts` → connector `TRACKUNIT.fetchSnapshots()`
- Auth: API-nøkkel per kundeorg. Lagres i secret-store (aldri i DB);
  `MachineTelemetryLink.credentialRef` peker til secret-navnet.
- Hent per maskin (externalId = Trackunit asset-ID) for perioden from→to:
  motortimer, tomgangstimer, drivstoff (l), energi (kWh), distanse (km).
- Map til `NormalizedSnapshot` (se interface). Legg original-payload i `raw`.
- Idempotens er håndtert (upsert på machineId+periodStart+provider).
**Akseptansekriterier:** cron `/api/cron/telemetri` lagrer snapshots for
testmaskin; `/api/flate?projectId=...` viser timer/tomgang; dobbeltkjøring
gir ikke duplikater.

## AP-2: Volvo CE Connect / CareTrack
Samme mønster som AP-1. OAuth2 client credentials. Merk: Volvo leverer ofte
akkumulerte tellere – beregn periodeverdier som differanse mot forrige snapshot.

## AP-3: Cat VisionLink, AP-4: Komatsu Komtrax, AP-5: Scania FMS
Samme mønster. Prioriter etter hvilke merker kundene faktisk har (spør salg).

## AP-6: Vektsystem-webhook (digitale lasslister)
- Ny rute: `POST /api/inbound/vekt` (opprettes av integrator)
- Sikring: HMAC-signatur i header med delt hemmelighet per vektleverandør
- Payload mappes til `LoadTicket` med `source: "SCALE_API"`; bruk leverandørens
  seddel-ID som `appSyncId` for idempotens
- Prosjektkobling: vektsystemets ordre-/prosjektreferanse → `Project.projectNumber`
**Akseptanse:** to like webhooks gir én LoadTicket; vekt, retning og massetype korrekt.

## AP-7: Prosjektallokering av telemetri
Implementer `finnProsjektForMaskin()` i telemetri.ts mot utleiemodulen
(aktiv RentalAgreement i perioden). Fallback: geofence mot prosjektadresse (fase 2).

## AP-8: CO2 inn i eksisterende dashboard
`GET /api/miljo/regnskap?scope=...&projectId=...&from=...&to=...` – rent JSON
(`totalKgCo2e`, `byOwnership`, `byFuelType`, `byProject`). Render med deres
eksisterende komponenter ved siden av maskiner/intervaller.

## Miljøvariabler
`CRON_SECRET`, `GPS_INGEST_SECRET`, `ANTHROPIC_API_KEY`, `REPORTING_AI_MODEL`,
`AI_LIMIT_ANALYSE/REPORT/MINIJURIST`, secrets per telemetrileverandør.

## AP-9: Lovdata Pro-integrasjon + felles rettskildebase
**Del A – Lovdata Pro API** (krever avtale med Lovdata om maskinell tilgang):
- Ny connector `src/lib/rettskilder/lovdata.ts`: søk i domsarkiv og lovkommentarer
  med kundens/deres Pro-abonnement. Legitimasjon i secret-store.
- Kobles inn i minijuristen som verktøy ved siden av web-søk: brukes når åpne
  kilder ikke gir treff (eldre lagmannsretts-/tingrettspraksis, kommentarer).

**Del B – Felles rettskildebase (RAG-forløper):**
- Hver gang minijuristen finner og verifiserer en relevant rettskilde, lagres
  den strukturert i `LegalSourceRef`: referanse (f.eks. HR-2019-1225-A eller
  LH-2019-27272), domstol, dato, tema-tags, KORT SAMMENDRAG (maks ~1000 tegn,
  egne ord), URL til kilden. ALDRI fulltekst – kun referat + kildehenvisning,
  som i enhver oppgave/utredning.
- Basen injiseres i minijurist-konteksten (kunnskapsUtdrag) ved tema-treff, og
  blir bedre for hver kunde som bruker modulen. Ved vekst: pgvector-søk.
**Akseptanse:** spørsmål om plunder og heft henter HR-2019-1225-A fra basen
uten nytt web-søk; nye funn dedupliseres på referanse; ingen fulltekst lagres.

## AP-10: ERP-/lønnsintegrasjon (Visma, Tripletex, PowerOffice)
- Kilde: `TimeEntry` (godkjente timer m/overtid) via `eksporterTimerCsv` eller JSON.
- Bygg push-connector per ERP (API-nøkkel per kundeorg i secret-store), map
  ansattId → ERP-ansattnummer (mapping-tabell per org).
- Sett `payrollExportedAt` ved vellykket overføring; aldri dobbel-eksporter.
**Akseptanse:** godkjente timer for en uke lander i test-ERP med korrekt
overtid; re-kjøring gir ingen duplikater.

## AP-11: Egne GPS-enheter – Teltonika og Mictrack
Valgt hardware: Teltonika FMB/FMC-serien (Codec 8 Extended; FMC m/CAN-adapter
gir også drivstoff/motortimer) og Mictrack MT-serien (posisjon/ignition).
- Enhetene PUSHER via TCP: sett opp en liten parser-tjeneste (Teltonika-parser
  finnes open source; alternativt mellomvare som flespi) som oversetter til
  JSON og poster til `POST /api/inbound/gps` med `x-ingest-secret`.
- IMEI registreres som `MachineTelemetryLink` (provider TELTONIKA/MICTRACK).
- Statuslogikk: ignition + fart < 2 km/t = IDLE (tomgang); aggregér døgnvis til
  `TelemetrySnapshot` i cron (engineHours fra ignition-tid, idleHours fra IDLE).
- Geofence-motoren kjører per posisjon (fart/forbud/arbeidstid/tyveri).
**Akseptanse:** testenhet vises på kartet innen 60 sek; tomgang telles; tyveri-
varsel utløses når enhet med ignition forlater anleggsgrensen.

## AP-12: Avrop mot Bjugstad-registeret (kundeoppfølgingsmodulen i Blazor)
Kunden oppretter avrop i portalen og sender til utleier; utleier behandler i
den eksisterende Blazor-kundemodulen mot eget register.
- **Portal → register:** `POST {BJUGSTAD_REGISTER_URL}/api/avrop` m/`x-api-key`.
  Payload: `{ portalCallOffId, number, frameAgreementRef, lines:[{ lineId,
  description, quantity, wantedFrom, wantedTo, projectId }] }`.
  Registeret svarer `{ externalRef }`. Avropet vises i Blazor-modulen under
  «Innkomne avrop» på kunden.
- **I Blazor-modulen:** utleier legger inn maskinnummer per linje; kontrakts-
  pris slås opp automatisk i prisregisteret (rammeavtalens prisliste) og
  følger linjen; utleier signerer (navn + tidspunkt).
- **Register → portal (webhook):** `POST /api/inbound/avrop-retur` m/
  `x-ingest-secret: AVROP_WEBHOOK_SECRET`. Payload: `{ portalCallOffId,
  lines:[{ lineId, machineNumber, priceText }], lessorSignedBy,
  lessorSignedAt }` → status PRICED_BY_LESSOR.
- **Kundesignatur:** kunden signerer i portalen → status ACTIVE, og portalen
  poster `POST {BJUGSTAD_REGISTER_URL}/api/avrop/{externalRef}/kundesignatur`.
  Signert PDF genereres og arkiveres i mappen «Avropsdokumenter».
**Env:** `BJUGSTAD_REGISTER_URL`, `BJUGSTAD_REGISTER_API_KEY`,
`AVROP_WEBHOOK_SECRET`.
**Akseptanse:** avrop sendt fra portal er synlig i Blazor-modulen < 10 sek;
priser i retur samsvarer med kontraktsprisregisteret; dobbel signatur gir
status ACTIVE begge steder; signert PDF ligger i Avropsdokumenter.
