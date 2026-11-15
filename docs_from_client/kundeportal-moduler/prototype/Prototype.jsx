import { useState, useEffect, useRef } from "react";

// ============================================================================
//  TESTPROTOTYPE – full portefølje
//  Prosjekt · Rapportering · Standardbibliotek (versjoner) · Minijuristen · Masse
//  Mockdata i minnet. AI-analyse, rapportgenerering og minijurist gjør EKTE
//  Claude-kall. Ingen database/innlogging.
// ============================================================================

let idc = 100; const nid = () => `x${idc++}`;

const MOCK_ORG = [
  { id: "o1", name: "Fjell Grunnarbeid AS", orgNumber: "912345678", city: "Oslo" },
  { id: "o2", name: "Nord Elektro AS", orgNumber: "998877665", city: "Trondheim" },
  { id: "o3", name: "Vestland Betong AS", orgNumber: "923456789", city: "Bergen" },
];
const MOCK_USERS = [
  { id: "u1", name: "Kari Nordmann", email: "kari@firma.no" },
  { id: "u2", name: "Ola Hansen", email: "ola@firma.no" },
  { id: "u3", name: "Ingrid Berg", email: "ingrid@firma.no" },
];
const MOCK_DOCS = [
  { id: "d1", fileName: "Kontrakt_vedlegg_C_SHA.pdf", text: "Vedlegg C – SHA. Totalentreprenør skal månedlig oversende SHA-rapport til byggherres representant Per Ås innen den 5. i påfølgende måned (antall RUH, vernerunder, status SHA-plan). Avfall rapporteres kvartalsvis med sorteringsgrad. Ved personskade med fravær varsles byggherre og Arbeidstilsynet umiddelbart. Kontrakten er basert på NS 8407." },
  { id: "d2", fileName: "Kontrakt_miljooppfolging.pdf", text: "Miljøoppfølgingsplan. Entreprenør rapporterer månedlig CO2-utslipp og drivstofforbruk fra anleggsmaskiner til byggherre. Støymålinger ukentlig; ved overskridelse varsles kommunen v/ miljørådgiver." },
];
const MOCK_MACHINES = [
  { id: "m1", name: "Gravemaskin CAT 320", availableFields: ["driftstimer", "drivstofforbruk", "sistService"] },
  { id: "m2", name: "Hjullaster Volvo L60", availableFields: ["driftstimer", "sistService"] },
];

// Felles standardbibliotek (delt) – seedet med noen med utdatert versjon
const seedStandards = () => [
  { id: nid(), type: "NS", code: "NS 8407", title: "Alminnelige kontraktsbestemmelser for totalentrepriser", latestKnownVersion: "2011", versions: [{ id: nid(), version: "2011", accessType: "LINK", sourceUrl: "https://standard.no", shared: true }] },
  { id: nid(), type: "REGULATION", code: "TEK", title: "Byggteknisk forskrift", latestKnownVersion: "2017", versions: [{ id: nid(), version: "2010", accessType: "UPLOAD", fileName: "TEK10.pdf", shared: false }] },
  { id: nid(), type: "NS", code: "NS 3420", title: "Beskrivelsestekster for bygg og anlegg", latestKnownVersion: "2023", versions: [{ id: nid(), version: "2019", accessType: "UPLOAD", fileName: "NS3420_2019.pdf", shared: true }] },
  { id: nid(), type: "LAW", code: "Byggherreforskriften", title: "Forskrift om sikkerhet, helse og arbeidsmiljø på bygge-/anleggsplasser", latestKnownVersion: "2010", versions: [{ id: nid(), version: "2010", accessType: "LINK", sourceUrl: "https://lovdata.no", shared: true }] },
];

const INTERVAL_LABEL = { ONE_TIME: "Engangs", DAILY: "Daglig", WEEKLY: "Ukentlig", BIWEEKLY: "Annenhver uke", MONTHLY: "Månedlig", QUARTERLY: "Kvartalsvis", SEMI_ANNUAL: "Halvårlig", ANNUAL: "Årlig", EVENT_BASED: "Hendelsesstyrt", CUSTOM: "Egendefinert" };
const SOURCE_META = { LAW: { title: "Lover og forskrifter", desc: "Myndighetskrav" }, NS_STANDARD: { title: "NS-standarder", desc: "Standardene du la inn" }, CONTRACT: { title: "Kontraktspesifikt", desc: "Fra dokumentene (AI-lest)" } };

const seedProject = () => ({
  id: nid(), projectNumber: "2026-014", name: "Bjørvika Felt B4", city: "Oslo",
  clientName: "Oslo Kommune Eiendom", clientContactName: "Per Ås",
  participants: [{ id: nid(), user: MOCK_USERS[0], role: "OWNER" }],
  subcontractors: [], nsStandards: [{ id: nid(), standardNo: "NS 8407" }], contractDocs: [], machines: MOCK_MACHINES,
  requirements: [], reports: [], massMovements: [],
});

// ── versjonslogikk ───────────────────────────────────────────────────────────
const vverdi = (v) => { if (!v) return -1; const m = String(v).match(/(\d{4})(?:[-/.](\d{1,2}))?/); if (m) return +m[1] * 100 + (m[2] ? +m[2] : 0); const n = String(v).match(/\d+/); return n ? +n[0] : 0; };
const vurderStandard = (s) => {
  const held = s.versions.map((v) => v.version).sort((a, b) => vverdi(b) - vverdi(a))[0] ?? null;
  const outdated = vverdi(s.latestKnownVersion) > vverdi(held);
  return { held, latest: s.latestKnownVersion, outdated, message: outdated ? `${s.code}: Vi har tilgjengelig versjon ${held ?? "(ingen)"}, mens siste publiserte er versjon ${s.latestKnownVersion}.` : null };
};
const nesteForfall = (interval) => { if (["EVENT_BASED", "CUSTOM", "ONE_TIME"].includes(interval)) return null; const sM = { MONTHLY: 1, QUARTERLY: 3, SEMI_ANNUAL: 6, ANNUAL: 12 }, sD = { DAILY: 1, WEEKLY: 7, BIWEEKLY: 14 }; const d = new Date(), n = new Date(); let i = 0; while (d <= n && i < 2000) { if (sM[interval]) d.setMonth(d.getMonth() + sM[interval]); else if (sD[interval]) d.setDate(d.getDate() + sD[interval]); i++; } return d; };

// ── AI ───────────────────────────────────────────────────────────────────────
async function callClaude(system, user, maxTokens = 1000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }) });
  const data = await res.json();
  return (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}
async function analyser(project) {
  const system = `Norsk fagekspert på rapporteringskrav i bygg/anlegg. Skill krav i LAW (lov/forskrift, oppgi hjemmel), NS_STANDARD (kun oppgitte), CONTRACT (kun fra dokumenttekst). Hvert krav: interval, recipientInstance, recipientName, dataFields med availableInPortal (true hvis blant maskinfeltene) og note. Svar KUN kompakt JSON, maks 6 krav, korte strenger, ingen markdown. {"summary":"..","requirements":[{"source":"LAW|NS_STANDARD|CONTRACT","title":"..","interval":"MONTHLY|QUARTERLY|WEEKLY|ANNUAL|EVENT_BASED|ONE_TIME","legalReference":"..","recipientInstance":"..","recipientName":"..","aiConfidence":0.0,"aiRationale":"..","dataFields":[{"label":"..","availableInPortal":true,"note":""}]}]}`;
  const maskiner = project.machines.map((m) => `- ${m.name} (${m.availableFields.join(", ")})`).join("\n");
  const ns = project.nsStandards.map((s) => `- ${s.standardNo}`).join("\n") || "(ingen)";
  const docs = project.contractDocs.map((d, i) => `DOK ${i + 1} ${d.fileName}:\n${d.text}`).join("\n\n") || "(ingen)";
  const raw = await callClaude(system, `Prosjekt ${project.projectNumber} ${project.name}, byggherre ${project.clientName}.\nMASKINER:\n${maskiner}\nNS:\n${ns}\nDOKUMENTER:\n${docs}`, 1000);
  return JSON.parse(raw.replace(/```json/g, "").replace(/```/g, "").trim());
}
async function genererTekst(project, req, fields) {
  const f = fields.map((x) => `- ${x.label}: ${x.value || "(tom)"} [${x.source}]`).join("\n");
  return callClaude(`Skriv ferdig, formell norsk rapporttekst. Kun oppgitte data. Manglende verdi: [mangler: felt]. Ren tekst.`, `Prosjekt ${project.projectNumber}. Rapport: ${req.title}. Hjemmel: ${req.legalReference || "-"}. Til: ${req.recipientInstance || "-"}.\nData:\n${f}`, 1000);
}
async function spørMinijurist(project, standards, question, history) {
  const outdated = standards.filter((s) => vurderStandard(s).outdated).map((s) => vurderStandard(s).message);
  const std = standards.map((s) => `- ${s.code} (v${vurderStandard(s).held}): ${s.title}`).join("\n");
  const kontrakt = project.contractDocs.map((d) => `${d.fileName}: ${d.text}`).join("\n") || "(ingen)";
  const system = `Du er «Minijuristen», norsk juridisk assistent for bygg/anlegg (NS 8405/8407, byggherreforskriften, entrepriserett). Svar konkret på norsk med hjemmel. Bruk kun oppgitt materiale. Hvis et versjonsvarsel gjelder standarden du bygger på, MÅ du nevne det. Gi juridisk informasjon, ikke bindende råd; anbefal kvalifisert gjennomgang ved reell tvil.`;
  const user = `PROSJEKT ${project.projectNumber} ${project.name}.\nSTANDARDER:\n${std}\nKONTRAKT:\n${kontrakt}\nVERSJONSVARSLER:\n${outdated.join("\n") || "(ingen)"}\n\nHISTORIKK:\n${history.map((m) => `${m.role}: ${m.content}`).join("\n")}\n\nSPØRSMÅL: ${question}`;
  const answer = await callClaude(system, user, 1500);
  return { answer, notices: outdated };
}

// ============================================================================
export default function App() {
  const [projects, setProjects] = useState([seedProject()]);
  const [standards, setStandards] = useState(seedStandards());
  const [view, setView] = useState("list");
  const [selPid, setSelPid] = useState(null);
  const [selRid, setSelRid] = useState(null);
  const project = projects.find((p) => p.id === selPid) || null;
  const report = project?.reports.find((r) => r.id === selRid) || null;
  const up = (pid, fn) => setProjects((ps) => ps.map((p) => (p.id === pid ? fn(p) : p)));
  const NavBtn = ({ v, children, onClick }) => <button onClick={onClick || (() => setView(v))} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{children}</button>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-1 px-5 py-3">
          <NavBtn v="list" onClick={() => { setView("list"); }}>Prosjekter</NavBtn>
          <NavBtn v="standards">Standardbibliotek</NavBtn>
          {project && <span className="text-slate-300">/</span>}
          {project && <span className="text-sm text-slate-500">{project.projectNumber} {project.name}</span>}
          <span className="ml-auto text-xs text-slate-400">Prototype · mock · live AI</span>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-5 py-8">
        {view === "list" && <ProsjektListe projects={projects} setProjects={setProjects} open={(id) => { setSelPid(id); setView("project"); }} />}
        {view === "standards" && <StandardView standards={standards} setStandards={setStandards} />}
        {view === "project" && project && <ProsjektDetalj project={project} up={up} go={(v) => setView(v)} />}
        {view === "reporting" && project && <Rapportering project={project} up={up} openReport={(rid) => { setSelRid(rid); setView("report"); }} back={() => setView("project")} />}
        {view === "report" && project && report && <RapportUtfylling project={project} report={report} up={up} back={() => setView("reporting")} />}
        {view === "minijurist" && project && <MinijuristView project={project} standards={standards} back={() => setView("project")} />}
        {view === "masse" && project && <MasseView project={project} up={up} back={() => setView("project")} />}
      </div>
    </div>
  );
}

// ── Prosjektliste ─────────────────────────────────────────────────────────────
function ProsjektListe({ projects, setProjects, open }) {
  const [ny, setNy] = useState(false);
  const [f, setF] = useState({ projectNumber: "", name: "", city: "", clientName: "" });
  const felt = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const create = () => { if (!f.projectNumber || !f.name) return; setProjects((ps) => [...ps, { ...seedProject(), ...f, id: nid(), participants: [{ id: nid(), user: MOCK_USERS[0], role: "OWNER" }], subcontractors: [], nsStandards: [], contractDocs: [], requirements: [], reports: [], massMovements: [] }]); setNy(false); setF({ projectNumber: "", name: "", city: "", clientName: "" }); };
  return (
    <div>
      <div className="mb-6 flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Prosjekter</h1><p className="text-sm text-slate-500">Kilden alle moduler henter prosjekt fra.</p></div><button onClick={() => setNy(!ny)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Nytt prosjekt</button></div>
      {ny && <div className="mb-6 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <input className={felt} placeholder="Prosjektnummer *" value={f.projectNumber} onChange={(e) => setF({ ...f, projectNumber: e.target.value })} />
        <input className={felt} placeholder="Prosjektnavn *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={felt} placeholder="Sted" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <input className={felt} placeholder="Byggherre" value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} />
        <button onClick={create} className="col-span-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Opprett</button>
      </div>}
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {projects.map((p) => <li key={p.id}><button onClick={() => open(p.id)} className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50"><span><span className="text-slate-400">{p.projectNumber}</span> · <span className="font-medium">{p.name}</span>{p.city && <span className="text-sm text-slate-500"> — {p.city}</span>}</span><span className="text-slate-400">›</span></button></li>)}
      </ul>
    </div>
  );
}

// ── Standardbibliotek ─────────────────────────────────────────────────────────
function StandardView({ standards, setStandards }) {
  const [exp, setExp] = useState(null);
  const TYPE = { NS: "NS-standard", LAW: "Lov", REGULATION: "Forskrift", OTHER: "Annet" };
  const addVersion = (sid, ver, mode, extra, share) => setStandards((ss) => ss.map((s) => s.id === sid ? { ...s, versions: [{ id: nid(), version: ver, accessType: mode, shared: share, ...extra }, ...s.versions] } : s));
  return (
    <div>
      <h1 className="text-2xl font-semibold">Standardbibliotek</h1>
      <p className="mb-6 text-sm text-slate-500">Felles bibliotek. Legg inn som lenke (minimum) eller last opp. Varsler når nyere versjon finnes.</p>
      <div className="space-y-3">
        {standards.map((s) => { const st = vurderStandard(s); return (
          <div key={s.id} className="rounded-xl border border-slate-200 bg-white">
            <button onClick={() => setExp(exp === s.id ? null : s.id)} className="flex w-full items-center justify-between px-5 py-4 text-left">
              <div><div className="flex items-center gap-2"><span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{TYPE[s.type]}</span><span className="font-medium">{s.code}</span><span className="text-sm text-slate-500">{s.title}</span></div>
                <div className="mt-1 text-xs text-slate-500">Vi har: {st.held ?? "(ingen)"} · Siste publiserte: {s.latestKnownVersion ?? "ukjent"}</div></div>
              {st.outdated && <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-800">Nyere finnes</span>}
            </button>
            {st.outdated && <p className="mx-5 mb-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">⚠ {st.message}</p>}
            {exp === s.id && <div className="border-t border-slate-100 px-5 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Versjoner vi har</p>
              <ul className="mb-4 space-y-1.5">{s.versions.map((v) => <li key={v.id} className="text-sm">v{v.version} · {v.accessType === "LINK" ? "lenke" : "opplastet"}{v.shared && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">delt</span>}</li>)}</ul>
              <AddVersion onAdd={(ver, mode, extra, share) => addVersion(s.id, ver, mode, extra, share)} />
            </div>}
          </div>
        ); })}
      </div>
    </div>
  );
}
function AddVersion({ onAdd }) {
  const [mode, setMode] = useState("LINK");
  const [f, setF] = useState({ version: "", sourceUrl: "", fileName: "", text: "" });
  const [share, setShare] = useState(false);
  const felt = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const submit = () => { if (!f.version.trim()) return; onAdd(f.version, mode, mode === "LINK" ? { sourceUrl: f.sourceUrl } : { fileName: f.fileName, text: f.text }, share); setF({ version: "", sourceUrl: "", fileName: "", text: "" }); setShare(false); };
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="mb-2 flex gap-2">
        <button onClick={() => setMode("LINK")} className={`rounded px-3 py-1 text-sm ${mode === "LINK" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white"}`}>Lenke (minimum)</button>
        <button onClick={() => setMode("UPLOAD")} className={`rounded px-3 py-1 text-sm ${mode === "UPLOAD" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white"}`}>Last opp</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={felt} placeholder="Versjon (f.eks. 2023)" value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} />
        {mode === "LINK" ? <input className={felt} placeholder="Lenke" value={f.sourceUrl} onChange={(e) => setF({ ...f, sourceUrl: e.target.value })} /> : <input className={felt} placeholder="Filnavn" value={f.fileName} onChange={(e) => setF({ ...f, fileName: e.target.value })} />}
      </div>
      {mode === "UPLOAD" && <label className="mt-2 flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5" /><span>Del til fellesbiblioteket (alle kunder + AI). Ikke del konfidensielt/opphavsrettsbeskyttet materiale du ikke har rett til å dele.</span></label>}
      <button onClick={submit} disabled={!f.version.trim()} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Legg til versjon</button>
    </div>
  );
}

// ── Prosjektdetalj ────────────────────────────────────────────────────────────
function ProsjektDetalj({ project, up, go }) {
  const [q, setQ] = useState(""); const [scope, setScope] = useState(""); const [picked, setPicked] = useState(null); const [uid, setUid] = useState("");
  const results = q.length >= 2 ? MOCK_ORG.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()) || o.orgNumber.includes(q)) : [];
  const ledige = MOCK_USERS.filter((u) => !project.participants.some((p) => p.user.id === u.id));
  const addUE = () => { if (!picked) return; up(project.id, (p) => ({ ...p, subcontractors: [...p.subcontractors, { id: nid(), org: picked, scope }] })); setPicked(null); setQ(""); setScope(""); };
  const addUser = () => { const u = MOCK_USERS.find((x) => x.id === uid); if (!u) return; up(project.id, (p) => ({ ...p, participants: [...p.participants, { id: nid(), user: u, role: "MEMBER" }] })); setUid(""); };
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{project.name}</h1><p className="text-sm text-slate-500">Prosjektnr. {project.projectNumber}</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => go("reporting")} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">Rapportering</button>
          <button onClick={() => go("minijurist")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Minijuristen</button>
          <button onClick={() => go("masse")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Massehåndtering</button>
        </div>
      </div>
      <div className="mb-8 grid grid-cols-2 gap-4"><Kort t="Sted">{project.city || "—"}</Kort><Kort t="Byggherre">{project.clientName}{project.clientContactName && <span className="block text-slate-500">{project.clientContactName}</span>}</Kort></div>
      <h2 className="mb-3 text-lg font-semibold">Deltakere</h2>
      <div className="mb-3 flex gap-2 rounded-lg border border-slate-200 p-3">
        <select className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" value={uid} onChange={(e) => setUid(e.target.value)}><option value="">Velg bruker i egen org…</option>{ledige.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <button onClick={addUser} disabled={!uid} className="rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-40">Legg til</button>
      </div>
      <ul className="mb-8 divide-y divide-slate-100 rounded-lg border border-slate-200">{project.participants.map((p) => <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm"><span>{p.user.name}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{p.role === "OWNER" ? "Eier" : "Deltaker"}</span></li>)}</ul>
      <h2 className="mb-3 text-lg font-semibold">Underentreprenører</h2>
      <div className="mb-3 rounded-lg border border-slate-200 p-3">
        {picked ? <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">{picked.name}</span><input className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Fagområde" value={scope} onChange={(e) => setScope(e.target.value)} /><button onClick={addUE} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Legg til</button></div>
          : <div className="relative"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Søk selskap i portalen…" value={q} onChange={(e) => setQ(e.target.value)} />{results.length > 0 && <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow">{results.map((o) => <li key={o.id}><button onClick={() => setPicked(o)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"><span>{o.name}</span><span className="text-xs text-slate-400">{o.orgNumber}</span></button></li>)}</ul>}</div>}
      </div>
      {project.subcontractors.length === 0 ? <p className="text-sm text-slate-500">Ingen UE lagt til.</p> : <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">{project.subcontractors.map((s) => <li key={s.id} className="px-4 py-2.5 text-sm">{s.org.name}{s.scope && <span className="text-slate-400"> · {s.scope}</span>}</li>)}</ul>}
    </div>
  );
}
const Kort = ({ t, children }) => <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t}</p><div className="text-sm text-slate-700">{children}</div></div>;

// ── Rapportering ──────────────────────────────────────────────────────────────
function Rapportering({ project, up, openReport, back }) {
  const [nsForm, setNsForm] = useState({ standardNo: "", title: "" });
  const [docSel, setDocSel] = useState(""); const [busy, setBusy] = useState(false); const [summary, setSummary] = useState(null); const [err, setErr] = useState(null);
  const addNs = () => { if (!nsForm.standardNo) return; up(project.id, (p) => ({ ...p, nsStandards: [...p.nsStandards, { id: nid(), ...nsForm }] })); setNsForm({ standardNo: "", title: "" }); };
  const draInn = () => { const d = MOCK_DOCS.find((x) => x.id === docSel); if (!d || project.contractDocs.some((c) => c.id === d.id)) return; up(project.id, (p) => ({ ...p, contractDocs: [...p.contractDocs, d] })); setDocSel(""); };
  const kjør = async () => { setBusy(true); setErr(null); setSummary(null); try { const res = await analyser(project); const reqs = (res.requirements || []).map((r) => ({ id: nid(), status: "PROPOSED", origin: "AI", ...r, dataFields: (r.dataFields || []).map((f) => ({ id: nid(), ...f })) })); up(project.id, (p) => ({ ...p, requirements: [...p.requirements.filter((x) => !(x.origin === "AI" && x.status === "PROPOSED")), ...reqs] })); setSummary(res.summary || "Analyse fullført."); } catch { setErr("AI-analysen feilet/ugyldig svar. Prøv igjen."); } setBusy(false); };
  const setStatus = (rid, status) => up(project.id, (p) => ({ ...p, requirements: status === "DISMISSED" ? p.requirements.filter((r) => r.id !== rid) : p.requirements.map((r) => (r.id === rid ? { ...r, status } : r)) }));
  const settOpp = (req) => { const rep = { id: nid(), title: `${req.title} – ${project.projectNumber}`, status: "DRAFT", autofilled: req.dataFields.filter((f) => f.availableInPortal).map((f) => ({ label: f.label, value: "", source: "portal" })), manual: req.dataFields.filter((f) => !f.availableInPortal).map((f) => ({ label: f.label, note: f.note, value: "", source: "manual" })), body: "", req }; up(project.id, (p) => ({ ...p, reports: [rep, ...p.reports] })); openReport(rep.id); };
  const grouped = { LAW: [], NS_STANDARD: [], CONTRACT: [] }; project.requirements.forEach((r) => grouped[r.source]?.push(r));
  const forfall = project.requirements.filter((r) => r.status === "ACTIVE").map((r) => ({ r, due: nesteForfall(r.interval) })).filter((x) => x.due);
  const felt = "rounded-lg border border-slate-300 px-3 py-2 text-sm";
  return (
    <div>
      <button onClick={back} className="text-sm text-slate-500 hover:text-slate-900">← Tilbake</button>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">Rapportering</h1><p className="mb-6 text-sm text-slate-500">Kartlegg alt som skal rapporteres, fordelt på tre kilder.</p>
      <h2 className="mb-2 text-lg font-semibold">NS-standarder</h2>
      <div className="mb-3 flex gap-2 rounded-lg border border-slate-200 p-3"><input className={felt + " flex-1"} placeholder="NS 8407" value={nsForm.standardNo} onChange={(e) => setNsForm({ ...nsForm, standardNo: e.target.value })} /><input className={felt + " flex-1"} placeholder="Tittel" value={nsForm.title} onChange={(e) => setNsForm({ ...nsForm, title: e.target.value })} /><button onClick={addNs} className="rounded-lg bg-slate-900 px-4 text-sm font-medium text-white">Legg til</button></div>
      {project.nsStandards.length > 0 && <ul className="mb-6 flex flex-wrap gap-2">{project.nsStandards.map((s) => <li key={s.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs">{s.standardNo} {s.title}</li>)}</ul>}
      <h2 className="mb-2 mt-4 text-lg font-semibold">Kontraktdokumenter</h2>
      <div className="mb-3 flex gap-2 rounded-lg border border-slate-200 p-3"><select className={felt + " flex-1"} value={docSel} onChange={(e) => setDocSel(e.target.value)}><option value="">Velg dokument…</option>{MOCK_DOCS.map((d) => <option key={d.id} value={d.id}>{d.fileName}</option>)}</select><button onClick={draInn} disabled={!docSel} className="rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-40">Dra inn</button></div>
      {project.contractDocs.length > 0 && <ul className="mb-6 space-y-1">{project.contractDocs.map((d) => <li key={d.id} className="text-sm text-slate-700">📄 {d.fileName}</li>)}</ul>}
      {forfall.length > 0 && <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4"><h3 className="mb-2 font-semibold">Forfall</h3><ul className="space-y-1">{forfall.map(({ r, due }) => { const dd = (due - new Date()) / 86400000; const c = dd < 0 ? "text-red-600" : dd <= 7 ? "text-orange-600" : "text-slate-500"; return <li key={r.id} className="flex justify-between text-sm"><span>{r.title}</span><span className={`text-xs ${c}`}>{due.toLocaleDateString("nb-NO", { day: "2-digit", month: "short" })}</span></li>; })}</ul></div>}
      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-100 p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="font-semibold">AI-kartlegging</h3><p className="mt-1 text-sm text-slate-600">Leser NS + kontraktdokumenter, kombinerer med lovkrav, foreslår krav, intervall, mottaker og datagrunnlag.</p></div><button onClick={kjør} disabled={busy} className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? "Analyserer…" : "Kjør AI-analyse"}</button></div>{summary && <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-700">{summary}</p>}{err && <p className="mt-3 text-sm text-red-600">{err}</p>}</div>
      {Object.entries(SOURCE_META).map(([key, meta]) => <section key={key} className="mb-8"><div className="mb-3 flex items-baseline gap-3"><h2 className="text-lg font-semibold">{meta.title}</h2><span className="text-sm text-slate-400">{meta.desc}</span><span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{grouped[key].length}</span></div>
        {grouped[key].length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-400">Ingen krav ennå.</p> : <ul className="space-y-3">{grouped[key].map((req) => <li key={req.id} className={`rounded-xl border bg-white p-4 ${req.status === "PROPOSED" ? "border-amber-300" : "border-slate-200"}`}>
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{req.title}</h3>{req.status === "PROPOSED" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">AI-forslag{req.aiConfidence ? ` · ${Math.round(req.aiConfidence * 100)}%` : ""}</span>}</div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span>🗓 {INTERVAL_LABEL[req.interval] || req.interval}</span>{req.recipientInstance && <span>📮 {req.recipientInstance}</span>}{req.recipientName && <span>👤 {req.recipientName}</span>}{req.legalReference && <span>§ {req.legalReference}</span>}</div>
          {req.dataFields?.length > 0 && <div className="mt-3 grid grid-cols-2 gap-3"><Bøtte t="Fra portalen" green felter={req.dataFields.filter((f) => f.availableInPortal)} /><Bøtte t="Må legges inn" felter={req.dataFields.filter((f) => !f.availableInPortal)} /></div>}
          {req.aiRationale && req.status === "PROPOSED" && <p className="mt-3 border-l-2 border-slate-200 pl-3 text-xs italic text-slate-500">{req.aiRationale}</p>}
          <div className="mt-4 flex gap-2">{req.status === "PROPOSED" ? <><button onClick={() => setStatus(req.id, "ACTIVE")} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Bekreft</button><button onClick={() => setStatus(req.id, "DISMISSED")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600">Avvis</button></> : <button onClick={() => settOpp(req)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Sett opp rapport →</button>}</div>
        </li>)}</ul>}
      </section>)}
      {project.reports.length > 0 && <section className="mb-8"><h2 className="mb-3 text-lg font-semibold">Rapporter</h2><ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">{project.reports.map((r) => <li key={r.id}><button onClick={() => openReport(r.id)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"><span className="text-sm">{r.title}</span><span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{r.status}</span></button></li>)}</ul></section>}
    </div>
  );
}
const Bøtte = ({ t, green, felter }) => <div className={`rounded-lg border p-3 ${green ? "border-emerald-200 bg-emerald-50" : "border-orange-200 bg-orange-50"}`}><p className="mb-1.5 text-xs font-semibold text-slate-700">{t}</p>{felter.length === 0 ? <p className="text-xs text-slate-400">—</p> : <ul className="space-y-1">{felter.map((f, i) => <li key={i} className="text-xs text-slate-700">• {f.label}{f.note && <span className="text-slate-400"> — {f.note}</span>}</li>)}</ul>}</div>;

// ── Rapportutfylling ──────────────────────────────────────────────────────────
function RapportUtfylling({ project, report, up, back }) {
  const [auto, setAuto] = useState(report.autofilled); const [manual, setManual] = useState(report.manual); const [body, setBody] = useState(report.body || ""); const [busy, setBusy] = useState(null);
  const save = (patch) => up(project.id, (p) => ({ ...p, reports: p.reports.map((r) => (r.id === report.id ? { ...r, ...patch } : r)) }));
  const generer = async () => { setBusy("gen"); const fields = [...auto, ...manual].map((f) => ({ label: f.label, value: f.value, source: f.source })); try { const t = await genererTekst(project, report.req, fields); setBody(t); save({ body: t, status: "READY", autofilled: auto, manual }); } catch { setBody("Kunne ikke generere – prøv igjen."); } setBusy(null); };
  const sendInn = () => { save({ body, status: "SUBMITTED" }); back(); };
  const felt = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  return (
    <div>
      <button onClick={back} className="text-sm text-slate-500 hover:text-slate-900">← Tilbake</button>
      <div className="mb-6 mt-2 flex items-center gap-3"><h1 className="text-2xl font-semibold">{report.title}</h1><span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{report.status}</span></div>
      <h2 className="mb-1 text-lg font-semibold">Hentet fra portalen</h2><p className="mb-3 text-sm text-slate-500">Forhåndsutfylt fra maskiner. Legg inn eksempelverdier.</p>
      {auto.length === 0 ? <p className="mb-6 text-sm text-slate-400">Ingen automatiske felt.</p> : <div className="mb-6 space-y-3">{auto.map((f, i) => <div key={i} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><label className="mb-1 block text-sm font-medium">{f.label}</label><input className={felt} value={f.value} onChange={(e) => setAuto(auto.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} /></div>)}</div>}
      <h2 className="mb-1 text-lg font-semibold">Må fylles inn</h2><p className="mb-3 text-sm text-slate-500">Data portalen ikke har.</p>
      {manual.length === 0 ? <p className="mb-6 text-sm text-slate-400">Ingen manuelle felt.</p> : <div className="mb-6 space-y-3">{manual.map((f, i) => <div key={i} className="rounded-lg border border-orange-200 bg-orange-50 p-3"><label className="mb-1 block text-sm font-medium">{f.label}</label>{f.note && <p className="mb-1 text-xs text-slate-500">{f.note}</p>}<input className={felt} value={f.value} onChange={(e) => setManual(manual.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} /></div>)}</div>}
      <button onClick={generer} disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy === "gen" ? "Genererer…" : "Generer rapporttekst"}</button>
      {body && <div className="mt-8"><h2 className="mb-1 text-lg font-semibold">Rapporttekst</h2><p className="mb-3 text-sm text-slate-500">Rediger fritt før innsending.</p><textarea className="min-h-[220px] w-full rounded-lg border border-slate-300 p-3 font-mono text-sm" value={body} onChange={(e) => setBody(e.target.value)} /><button onClick={sendInn} className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Marker som sendt</button></div>}
    </div>
  );
}

// ── Minijuristen ──────────────────────────────────────────────────────────────
function MinijuristView({ project, standards, back }) {
  const [messages, setMessages] = useState([]); const [input, setInput] = useState(""); const [busy, setBusy] = useState(false); const endRef = useRef(null);
  // standarder prosjektet bruker (matcher nsStandards mot biblioteket)
  const projStandards = standards.filter((s) => project.nsStandards.some((n) => n.standardNo === s.code) || ["TEK", "Byggherreforskriften"].includes(s.code));
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  const send = async () => { const q = input.trim(); if (!q || busy) return; setInput(""); const hist = messages.map((m) => ({ role: m.role, content: m.content })); setMessages((m) => [...m, { role: "user", content: q }]); setBusy(true); try { const { answer, notices } = await spørMinijurist(project, projStandards, q, hist); setMessages((m) => [...m, { role: "assistant", content: answer, notices }]); } catch { setMessages((m) => [...m, { role: "assistant", content: "Noe gikk galt. Prøv igjen." }]); } setBusy(false); };
  return (
    <div>
      <button onClick={back} className="text-sm text-slate-500 hover:text-slate-900">← Tilbake</button>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">Minijuristen</h1>
      <p className="mb-4 text-sm text-slate-500">Bruker prosjektets kontrakt + fellesbibliotekets standarder. Varsler om utdaterte versjoner. Prøv f.eks.: «Hvilke varslingsfrister gjelder ved endringer, og bygger vi på riktig versjon av standarden?»</p>
      <div className="flex h-[60vh] flex-col rounded-xl border border-slate-200 bg-white">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && <div className="pt-8 text-center text-sm text-slate-400">Still et juridisk spørsmål om kontrakten eller standardene.</div>}
          {messages.map((m, i) => <div key={i} className={m.role === "user" ? "flex justify-end" : ""}><div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"}`}>{m.content}{m.notices?.length > 0 && <div className="mt-2 space-y-1">{m.notices.map((n, j) => <p key={j} className="rounded-lg bg-orange-100 px-2 py-1 text-xs text-orange-800">⚠ {n}</p>)}</div>}</div></div>)}
          {busy && <div className="text-sm text-slate-400">Minijuristen tenker…</div>}
          <div ref={endRef} />
        </div>
        <div className="border-t border-slate-100 p-3"><div className="flex gap-2"><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={2} placeholder="Skriv spørsmålet ditt…" className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button onClick={send} disabled={busy || !input.trim()} className="rounded-lg bg-slate-900 px-5 text-sm font-medium text-white disabled:opacity-50">Send</button></div></div>
      </div>
    </div>
  );
}

// ── Massehåndtering ───────────────────────────────────────────────────────────
function MasseView({ project, up, back }) {
  const KLASSE = { CLEAN: { label: "Rene", f: "bg-emerald-100 text-emerald-700" }, CONTAMINATED: { label: "Forurenset", f: "bg-orange-100 text-orange-700" }, HAZARDOUS: { label: "Farlig avfall", f: "bg-red-100 text-red-700" }, UNKNOWN: { label: "Uklassifisert", f: "bg-slate-100 text-slate-600" } };
  const STATUS = { PLANNED: "Planlagt", IN_TRANSIT: "Under transport", DELIVERED: "Levert", REJECTED: "Avvist" };
  const [form, setForm] = useState({ massType: "", classification: "UNKNOWN", volumeM3: "", originLocation: "", destinationName: "", transporter: "", declarationRef: "" });
  const felt = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const movements = project.massMovements;
  const summary = movements.reduce((a, m) => { a[m.classification] = (a[m.classification] || 0) + (+m.volumeM3 || 0); return a; }, {});
  const opprett = () => { if (!form.massType.trim()) return; up(project.id, (p) => ({ ...p, massMovements: [{ id: nid(), status: "PLANNED", ...form, volumeM3: form.volumeM3 ? +form.volumeM3 : null }, ...p.massMovements] })); setForm({ massType: "", classification: "UNKNOWN", volumeM3: "", originLocation: "", destinationName: "", transporter: "", declarationRef: "" }); };
  const setStatus = (id, status) => up(project.id, (p) => ({ ...p, massMovements: p.massMovements.map((m) => (m.id === id ? { ...m, status } : m)) }));
  return (
    <div>
      <button onClick={back} className="text-sm text-slate-500 hover:text-slate-900">← Tilbake</button>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">Massehåndtering</h1><p className="mb-6 text-sm text-slate-500">Registrer masseflyttinger, klassifisering og dokumentasjon.</p>
      {Object.keys(summary).length > 0 && <div className="mb-6 flex flex-wrap gap-3">{Object.entries(summary).map(([k, v]) => <div key={k} className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-xs text-slate-500">{KLASSE[k]?.label}</p><p className="text-lg font-semibold">{v.toLocaleString("nb-NO")} m³</p></div>)}</div>}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4"><p className="mb-3 text-sm font-medium text-slate-700">Ny masseflytting</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <input className={felt} placeholder="Massetype (jord)" value={form.massType} onChange={(e) => setForm({ ...form, massType: e.target.value })} />
          <select className={felt} value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })}>{Object.entries(KLASSE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <input className={felt} type="number" placeholder="Volum m³" value={form.volumeM3} onChange={(e) => setForm({ ...form, volumeM3: e.target.value })} />
          <input className={felt} placeholder="Fra" value={form.originLocation} onChange={(e) => setForm({ ...form, originLocation: e.target.value })} />
          <input className={felt} placeholder="Mottak/deponi" value={form.destinationName} onChange={(e) => setForm({ ...form, destinationName: e.target.value })} />
          <input className={felt} placeholder="Transportør" value={form.transporter} onChange={(e) => setForm({ ...form, transporter: e.target.value })} />
          <input className={`${felt} col-span-2 sm:col-span-3`} placeholder="Avfallsdeklarering (ved forurenset)" value={form.declarationRef} onChange={(e) => setForm({ ...form, declarationRef: e.target.value })} />
        </div>
        {(form.classification === "CONTAMINATED" || form.classification === "HAZARDOUS") && !form.declarationRef && <p className="mt-2 text-xs text-orange-700">Forurensede/farlige masser krever normalt avfallsdeklarering og godkjent mottak.</p>}
        <button onClick={opprett} disabled={!form.massType.trim()} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Registrer</button>
      </div>
      {movements.length === 0 ? <p className="text-sm text-slate-500">Ingen masseflyttinger registrert.</p> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-2">Type</th><th className="px-4 py-2">Klasse</th><th className="px-4 py-2">Volum</th><th className="px-4 py-2">Mottak</th><th className="px-4 py-2">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{movements.map((m) => <tr key={m.id}><td className="px-4 py-2.5">{m.massType}</td><td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs ${KLASSE[m.classification]?.f}`}>{KLASSE[m.classification]?.label}</span></td><td className="px-4 py-2.5">{m.volumeM3 ? `${m.volumeM3} m³` : "—"}</td><td className="px-4 py-2.5">{m.destinationName || "—"}</td><td className="px-4 py-2.5"><select value={m.status} onChange={(e) => setStatus(m.id, e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-xs">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td></tr>)}</tbody></table></div>}
    </div>
  );
}
