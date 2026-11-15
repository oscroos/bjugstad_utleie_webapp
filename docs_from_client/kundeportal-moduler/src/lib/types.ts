// Delte typer for prosjekt- og rapporteringsmodulen.
// Prisma genererer sine egne typer; disse dekker DTO-er over API-grensen
// og strukturen AI-analysen returnerer.

export type RequirementSource = "LAW" | "NS_STANDARD" | "CONTRACT";

export type ReportInterval =
  | "ONE_TIME"
  | "DAILY"
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMI_ANNUAL"
  | "ANNUAL"
  | "EVENT_BASED"
  | "CUSTOM";

export type DataSourceType =
  | "PORTAL_MACHINE"
  | "PORTAL_AGREEMENT"
  | "PORTAL_DOCUMENT"
  | "MANUAL_INPUT"
  | "CALCULATED";

// ── Prosjekt-DTO-er ─────────────────────────────────────────────────────────

export interface ProjectListItem {
  id: string;
  projectNumber: string;
  name: string;
  city: string | null;
  status: string;
}

export interface OrgSearchResult {
  id: string;
  name: string;
  orgNumber: string | null;
  city: string | null;
}

// ── Kontekst som mates til AI-analysen ──────────────────────────────────────

export interface MachineContext {
  id: string;
  name: string;
  type: string | null;
  // Felt vi faktisk har tall/status på i portalen:
  availableFields: string[]; // f.eks. ["operatingHours", "lastServiceDate", "fuelType"]
}

export interface ProjectAnalysisContext {
  project: {
    projectNumber: string;
    name: string;
    city: string | null;
    clientName: string | null;
  };
  machines: MachineContext[];
  nsStandards: { standardNo: string; title: string | null; clause: string | null }[];
  contractDocuments: { fileName: string; text: string }[]; // uttrukket dokumenttekst
  // Interne moduler med data (HMS, miljø) – AI markerer tilhørende felt som
  // availableInPortal=true med sourceRef mot disse kildene.
  internalSources: string[];
}

// ── Strukturert AI-resultat (matcher tool-schemaet i reporting-analyzer.ts) ──

export interface AiDataField {
  label: string;
  sourceType: DataSourceType;
  sourceRef?: string;
  availableInPortal: boolean;
  required: boolean;
  note?: string;
}

export interface AiRequirement {
  source: RequirementSource;
  title: string;
  description: string;
  legalReference?: string;
  interval: ReportInterval;
  intervalDetail?: string;
  recipientInstance?: string;
  recipientName?: string;
  recipientEmail?: string;
  aiConfidence: number; // 0–1
  aiRationale: string;
  dataFields: AiDataField[];
}

export interface AiAnalysisResult {
  requirements: AiRequirement[];
  summary: string; // kort oppsummering til brukeren
}
