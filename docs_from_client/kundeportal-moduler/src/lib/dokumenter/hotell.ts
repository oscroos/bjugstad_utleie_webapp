import { prisma } from "@/lib/prisma";

// ────────────────────────────────────────────────────────────────────────────
//  DOKUMENTHOTELL
//  Faste hovedmapper: Avtaledokumenter, Avropsdokumenter, Kundedokumenter,
//  Andre dokumenter, Prosjektdokumenter. Under Avtaledokumenter: Leie
//  Bjugstad Utleie, Underentreprenører, Leverandører (alle SYSTEM = låst).
//  Under Prosjektdokumenter oppretter kunden prosjektmapper (krever at
//  prosjektet finnes) med valgfrie undermapper. Prosjektmappene speiles i
//  Dokumenter-underfanen inne på prosjektet – samme data, to innganger.
// ────────────────────────────────────────────────────────────────────────────
const ROOTS: { key: string; name: string }[] = [
  { key: "AVTALE",   name: "Avtaledokumenter" },
  { key: "AVROP",    name: "Avropsdokumenter" },
  { key: "KUNDE",    name: "Kundedokumenter" },
  { key: "ANDRE",    name: "Andre dokumenter" },
  { key: "PROSJEKT", name: "Prosjektdokumenter" },
];
const AVTALE_SUBS = [
  { key: "AVTALE_BJUGSTAD", name: "Leie Bjugstad Utleie" },
  { key: "AVTALE_UE",       name: "Underentreprenører" },
  { key: "AVTALE_LEV",      name: "Leverandører" },
];

/** Idempotent – kjøres ved org-opprettelse og som sikkerhetsnett ved lesing. */
export async function seedDokumenthotell(organizationId: string) {
  for (const r of ROOTS) {
    const root = await prisma.docFolder.upsert({
      where: { organizationId_systemKey: { organizationId, systemKey: r.key } } as never,
      update: {},
      create: { organizationId, name: r.name, kind: "SYSTEM", systemKey: r.key },
    }).catch(async () => {
      const eks = await prisma.docFolder.findFirst({ where: { organizationId, systemKey: r.key } });
      return eks ?? prisma.docFolder.create({ data: { organizationId, name: r.name, kind: "SYSTEM", systemKey: r.key } });
    });
    if (r.key === "AVTALE") {
      for (const s of AVTALE_SUBS) {
        const eks = await prisma.docFolder.findFirst({ where: { organizationId, systemKey: s.key } });
        if (!eks) await prisma.docFolder.create({ data: { organizationId, parentId: root.id, name: s.name, kind: "SYSTEM", systemKey: s.key } });
      }
    }
  }
}

/** Prosjektmappe under «Prosjektdokumenter». Prosjektet MÅ finnes først. */
export async function opprettProsjektmappe(organizationId: string, projectId: string, createdById: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
  if (!project) throw new Error("Prosjektet finnes ikke – opprett prosjektet først.");
  const root = await prisma.docFolder.findFirst({ where: { organizationId, systemKey: "PROSJEKT" } });
  if (!root) throw new Error("Dokumenthotellet er ikke initialisert.");
  const eks = await prisma.docFolder.findFirst({ where: { organizationId, parentId: root.id, projectId } });
  if (eks) return eks;
  return prisma.docFolder.create({
    data: { organizationId, parentId: root.id, name: project.projectNumber + " " + project.name, kind: "PROJECT", projectId, createdById },
  });
}

/** Undermappe i en prosjektmappe – arver projectId slik at den vises på prosjektet. */
export async function opprettUndermappe(organizationId: string, parentId: string, name: string, createdById: string) {
  const parent = await prisma.docFolder.findFirst({ where: { id: parentId, organizationId } });
  if (!parent) throw new Error("Ukjent mappe.");
  return prisma.docFolder.create({
    data: { organizationId, parentId, name: name.trim(), kind: "CUSTOM", projectId: parent.projectId, createdById },
  });
}

export async function hentProsjektMapper(organizationId: string, projectId: string) {
  return prisma.docFolder.findMany({
    where: { organizationId, projectId },
    include: { files: true, children: { include: { files: true } } },
    orderBy: { createdAt: "asc" },
  });
}
