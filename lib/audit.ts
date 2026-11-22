// Pure helpers for the activity log: what changed, and how an entry is described.
// No database access here, so both the server and the admin table can import it.

/** One edited value. `from` is null when something was added, `to` is null when it was removed. */
export type AuditChange = {
  label: string;
  from: string | null;
  to: string | null;
};

export type AuditCategory =
  | "LOGIN"
  | "PROJECT"
  | "ACCESS"
  | "ZONES"
  | "MASSES"
  | "DOCUMENTS"
  | "CALL_OFF"
  | "CATALOG"
  | "TELEMETRY"
  | "OTHER";

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  LOGIN: "Innlogging",
  PROJECT: "Prosjekt",
  ACCESS: "Brukertilganger",
  ZONES: "Anleggssoner",
  MASSES: "Masse",
  DOCUMENTS: "Dokumenter",
  CALL_OFF: "Avrop",
  CATALOG: "Katalog",
  TELEMETRY: "Telemetri",
  OTHER: "Annet",
};

const ACTIONS: Record<string, { category: AuditCategory; label: string }> = {
  "project.create": { category: "PROJECT", label: "Opprettet prosjekt" },
  "project.setup.update": { category: "PROJECT", label: "Endret prosjektoppsett" },
  "project.zones.updated": { category: "ZONES", label: "Endret anleggssoner" },
  "project.participant.added": { category: "ACCESS", label: "La til deltaker" },
  "project.participant.removed": { category: "ACCESS", label: "Fjernet bruker fra prosjektet" },
  "project.lead.changed": { category: "ACCESS", label: "Byttet prosjektleder" },
  "document.folder.project.create": { category: "DOCUMENTS", label: "Opprettet prosjektmappe" },
  "document.folder.create": { category: "DOCUMENTS", label: "Opprettet mappe" },
  "document.folder.rename": { category: "DOCUMENTS", label: "Ga mappe nytt navn" },
  "document.folder.delete": { category: "DOCUMENTS", label: "Slettet mappe" },
  "call_off.create": { category: "CALL_OFF", label: "Opprettet avrop" },
  "call_off.send": { category: "CALL_OFF", label: "Sendte avrop" },
  "call_off.sign": { category: "CALL_OFF", label: "Signerte avrop" },
  "call_off.reject": { category: "CALL_OFF", label: "Avslo avrop" },
  "call_off.cancel": { category: "CALL_OFF", label: "Kansellerte avrop" },
  "call_off.lessor_return": { category: "CALL_OFF", label: "Mottok retur fra utleier" },
  "admin.mass_type.create": { category: "CATALOG", label: "Opprettet massetype" },
  "admin.mass_type.update": { category: "CATALOG", label: "Endret massetype" },
  "admin.mass_type.deactivate": { category: "CATALOG", label: "Deaktiverte massetype" },
  "admin.mass_type.delete": { category: "CATALOG", label: "Slettet massetype" },
  "admin.project_field.create": { category: "CATALOG", label: "Opprettet prosjektfelt" },
  "admin.project_field.update": { category: "CATALOG", label: "Endret prosjektfelt" },
  "admin.project_field.deactivate": { category: "CATALOG", label: "Deaktiverte prosjektfelt" },
  "admin.project_field.delete": { category: "CATALOG", label: "Slettet prosjektfelt" },
  "admin.telemetry_link.create": { category: "TELEMETRY", label: "Opprettet telemetrikobling" },
  "admin.telemetry_link.update": { category: "TELEMETRY", label: "Endret telemetrikobling" },
  "admin.telemetry_link.delete": { category: "TELEMETRY", label: "Slettet telemetrikobling" },
};

const MASS_PLAN_PREFIX = "Masseplan ";

/**
 * Category and readable description for a stored action code. A project setup
 * edit that only touched the mass plan is filed under "Masse".
 */
export function describeAuditAction(
  action: string,
  changes: AuditChange[] = [],
): { category: AuditCategory; label: string } {
  const known = ACTIONS[action];
  if (!known) return { category: "OTHER", label: action };
  if (
    action === "project.setup.update" &&
    changes.length > 0 &&
    changes.every((change) => change.label.startsWith(MASS_PLAN_PREFIX))
  ) {
    return { category: "MASSES", label: "Endret masseplan" };
  }
  return known;
}

/** Reads `changes` back out of stored metadata, ignoring anything malformed. */
export function parseAuditChanges(metadata: unknown): AuditChange[] {
  if (!isRecord(metadata) || !Array.isArray(metadata.changes)) return [];
  const changes: AuditChange[] = [];
  for (const entry of metadata.changes) {
    if (!isRecord(entry) || typeof entry.label !== "string") continue;
    changes.push({
      label: entry.label,
      from: typeof entry.from === "string" ? entry.from : null,
      to: typeof entry.to === "string" ? entry.to : null,
    });
  }
  return changes;
}

export function readAuditString(metadata: unknown, key: string): string | null {
  if (!isRecord(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

/** Label -> display value. A missing label or null means "not set". */
export type AuditSnapshot = Record<string, string | null>;

/** Lists every label whose value differs between two snapshots, in the order of first appearance. */
export function diffSnapshots(before: AuditSnapshot, after: AuditSnapshot): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const label of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const from = emptyToNull(before[label]);
    const to = emptyToNull(after[label]);
    if (from !== to) changes.push({ label, from, to });
  }
  return changes;
}

export type AuditZone = {
  id: string;
  name: string;
  color: string;
  coordinates: Array<[number, number]>;
};

/** Describes added, removed, renamed, recoloured and redrawn site zones. */
export function diffZones(before: AuditZone[], after: AuditZone[]): AuditChange[] {
  const changes: AuditChange[] = [];
  const afterById = new Map(after.map((zone) => [zone.id, zone]));
  const beforeIds = new Set(before.map((zone) => zone.id));

  for (const zone of before) {
    const next = afterById.get(zone.id);
    if (!next) {
      changes.push({ label: `Sone «${zone.name}»`, from: pointCount(zone), to: null });
      continue;
    }
    if (zone.name !== next.name) {
      changes.push({ label: `Sone «${zone.name}»: navn`, from: zone.name, to: next.name });
    }
    if (zone.color.toLowerCase() !== next.color.toLowerCase()) {
      changes.push({ label: `Sone «${next.name}»: farge`, from: zone.color, to: next.color });
    }
    if (JSON.stringify(zone.coordinates) !== JSON.stringify(next.coordinates)) {
      const same = zone.coordinates.length === next.coordinates.length;
      changes.push({
        label: `Sone «${next.name}»: område`,
        from: pointCount(zone),
        to: same ? `${pointCount(next)}, flyttet` : pointCount(next),
      });
    }
  }

  for (const zone of after) {
    if (!beforeIds.has(zone.id)) {
      changes.push({ label: `Sone «${zone.name}»`, from: null, to: `Ny sone, ${pointCount(zone)}` });
    }
  }

  return changes;
}

function pointCount(zone: AuditZone) {
  return `${zone.coordinates.length} punkter`;
}

// ---------------------------------------------------------------------------
// Display values
// ---------------------------------------------------------------------------

const numberFormat = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 });

export function auditNumber(value: number | null | undefined, unit?: string | null): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  // nb-NO groups thousands with a non-breaking space; keep plain spaces in the log.
  const formatted = numberFormat.format(value).replace(/[  ]/g, " ");
  return unit ? `${formatted} ${unit}` : formatted;
}

export function auditDate(value: Date | null | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  const pad = (part: number) => String(part).padStart(2, "0");
  // Dates are stored at midnight UTC, so UTC parts give the date that was entered.
  return `${pad(value.getUTCDate())}.${pad(value.getUTCMonth() + 1)}.${value.getUTCFullYear()}`;
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
