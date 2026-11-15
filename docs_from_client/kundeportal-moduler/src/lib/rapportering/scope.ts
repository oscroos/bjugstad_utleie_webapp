// ────────────────────────────────────────────────────────────────────────────
//  RAPPORTERINGSSCOPE (del 9)
//  En rapport kan gjelde: ett prosjekt, FLERE prosjekter samlet (2–3 er vanlig,
//  f.eks. delfelt under samme byggherre), eller hele selskapet (firmarapport).
//  UE/innleide kan inkluderes eller ekskluderes: de er normalt MED i
//  prosjektrapporter til byggherre, men IKKE i firmarapporter (egne tall).
// ────────────────────────────────────────────────────────────────────────────
export type ReportScope = {
  kind: "PROJECTS" | "COMPANY";
  projectIds: string[];              // tom ved COMPANY
  includeSubcontractors: boolean;    // default: PROJECTS=true, COMPANY=false
};

export function defaultScope(kind: ReportScope["kind"], projectIds: string[] = []): ReportScope {
  return { kind, projectIds, includeSubcontractors: kind === "PROJECTS" };
}

/** Prisma-filter for eierskap gitt scope – brukes i CO2-, telemetri- og
 *  lasslistespørringene når rapportgrunnlag hentes. */
export function ownershipFilter(scope: ReportScope) {
  return scope.includeSubcontractors
    ? undefined // alle
    : { ownership: { in: ["OWNED", "RENTED", "OWNED_RENTED"] } };
}
