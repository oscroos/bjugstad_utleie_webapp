import type { FolderKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type DocumentCustomerOption = {
  id: number;
  name: string | null;
  organizationNumber: string | null;
};

export type DocumentProjectOption = {
  id: string;
  projectNumber: string;
  name: string;
  clientName: string | null;
  city: string | null;
};

export type DocumentFileItem = {
  id: string;
  name: string;
  storageKey: string | null;
  sizeBytes: number | null;
  contentType: string | null;
  uploadedByName: string | null;
  createdAt: string;
};

export type DocumentFolderNode = {
  id: string;
  customerId: number;
  parentId: string | null;
  name: string;
  kind: FolderKind;
  systemKey: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  files: DocumentFileItem[];
  children: DocumentFolderNode[];
};

const ROOT_FOLDERS = [
  { key: "AVTALE", name: "Avtaledokumenter" },
  { key: "AVROP", name: "Avropsdokumenter" },
  { key: "KUNDE", name: "Kundedokumenter" },
  { key: "ANDRE", name: "Andre dokumenter" },
  { key: "PROSJEKT", name: "Prosjektdokumenter" },
] as const;

const AGREEMENT_SUBFOLDERS = [
  { key: "AVTALE_BJUGSTAD", name: "Leie Bjugstad Utleie" },
  { key: "AVTALE_UE", name: "Underentreprenører" },
  { key: "AVTALE_LEV", name: "Leverandører" },
] as const;

const SYSTEM_SORT_ORDER = new Map<string, number>(
  [...ROOT_FOLDERS, ...AGREEMENT_SUBFOLDERS].map((folder, index) => [folder.key, index]),
);

export function isDocumentStorageConfigured() {
  return Boolean(
    process.env.AZURE_BLOB_CONNECTION_STRING?.trim() ||
      process.env.AZURE_BLOB_SAS_TOKEN?.trim(),
  );
}

export async function listDocumentCustomersForUser(
  userId: string,
  role?: string | null,
): Promise<DocumentCustomerOption[]> {
  if (role === "super_admin") {
    const customers = await prisma.customer.findMany({
      select: {
        customer_id: true,
        name: true,
        organization_number: true,
      },
      orderBy: { name: "asc" },
    });

    return customers.map((customer) => ({
      id: customer.customer_id,
      name: customer.name,
      organizationNumber: customer.organization_number,
    }));
  }

  const accesses = await prisma.userCustomerAccess.findMany({
    where: { userId },
    select: {
      customer: {
        select: {
          customer_id: true,
          name: true,
          organization_number: true,
        },
      },
    },
    orderBy: {
      customer: {
        name: "asc",
      },
    },
  });

  return accesses.map((access) => ({
    id: access.customer.customer_id,
    name: access.customer.name,
    organizationNumber: access.customer.organization_number,
  }));
}

export async function listDocumentProjectsForCustomer(
  customerId: number,
): Promise<DocumentProjectOption[]> {
  const projects = await prisma.project.findMany({
    where: {
      customerId,
      status: { not: "ARCHIVED" },
    },
    select: {
      id: true,
      projectNumber: true,
      name: true,
      clientName: true,
      city: true,
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return projects;
}

export async function seedDocumentHotel(customerId: number, createdById?: string | null) {
  for (const rootDefinition of ROOT_FOLDERS) {
    const root = await prisma.docFolder.upsert({
      where: {
        customerId_systemKey: {
          customerId,
          systemKey: rootDefinition.key,
        },
      },
      update: {
        parentId: null,
        name: rootDefinition.name,
        kind: "SYSTEM",
      },
      create: {
        customerId,
        parentId: null,
        name: rootDefinition.name,
        kind: "SYSTEM",
        systemKey: rootDefinition.key,
        createdById: createdById ?? null,
      },
    });

    if (rootDefinition.key === "AVTALE") {
      for (const subDefinition of AGREEMENT_SUBFOLDERS) {
        await prisma.docFolder.upsert({
          where: {
            customerId_systemKey: {
              customerId,
              systemKey: subDefinition.key,
            },
          },
          update: {
            parentId: root.id,
            name: subDefinition.name,
            kind: "SYSTEM",
          },
          create: {
            customerId,
            parentId: root.id,
            name: subDefinition.name,
            kind: "SYSTEM",
            systemKey: subDefinition.key,
            createdById: createdById ?? null,
          },
        });
      }
    }
  }
}

export async function listDocumentTree(customerId: number): Promise<DocumentFolderNode[]> {
  await seedDocumentHotel(customerId);

  const folders = await prisma.docFolder.findMany({
    where: { customerId },
    include: {
      files: {
        include: {
          uploadedBy: {
            select: { name: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
  });

  return buildTree(folders);
}

export async function listProjectDocumentTree(
  customerId: number,
  projectId: string,
): Promise<DocumentFolderNode[]> {
  await seedDocumentHotel(customerId);

  const folders = await prisma.docFolder.findMany({
    where: { customerId, projectId },
    include: {
      files: {
        include: {
          uploadedBy: {
            select: { name: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
  });

  return buildTree(folders);
}

export async function createProjectFolder(params: {
  customerId: number;
  projectId: string;
  createdById: string;
}) {
  await seedDocumentHotel(params.customerId, params.createdById);

  const [project, projectRoot] = await Promise.all([
    prisma.project.findFirst({
      where: {
        id: params.projectId,
        customerId: params.customerId,
      },
      select: {
        id: true,
        projectNumber: true,
        name: true,
      },
    }),
    prisma.docFolder.findUnique({
      where: {
        customerId_systemKey: {
          customerId: params.customerId,
          systemKey: "PROSJEKT",
        },
      },
    }),
  ]);

  if (!project) {
    throw new Error("Prosjektet finnes ikke for valgt kunde.");
  }
  if (!projectRoot) {
    throw new Error("Dokumenthotellet er ikke initialisert.");
  }

  const existing = await prisma.docFolder.findFirst({
    where: {
      customerId: params.customerId,
      parentId: projectRoot.id,
      projectId: params.projectId,
      kind: "PROJECT",
    },
  });

  if (existing) return existing;

  return prisma.docFolder.create({
    data: {
      customerId: params.customerId,
      parentId: projectRoot.id,
      name: `${project.projectNumber} ${project.name}`,
      kind: "PROJECT",
      projectId: project.id,
      createdById: params.createdById,
    },
  });
}

export async function getDocumentFolder(folderId: string) {
  return prisma.docFolder.findUnique({
    where: { id: folderId },
    select: {
      id: true,
      customerId: true,
      parentId: true,
      kind: true,
      systemKey: true,
      projectId: true,
      name: true,
    },
  });
}

export async function createSubfolder(params: {
  customerId: number;
  parentId: string;
  name: string;
  createdById: string;
}) {
  const parent = await prisma.docFolder.findFirst({
    where: {
      id: params.parentId,
      customerId: params.customerId,
    },
    select: {
      id: true,
      systemKey: true,
      projectId: true,
    },
  });

  if (!parent) {
    throw new Error("Mappen finnes ikke.");
  }
  if (parent.systemKey === "PROSJEKT") {
    throw new Error("Prosjektmapper må opprettes ved å velge et eksisterende prosjekt.");
  }

  const name = params.name.trim();
  if (!name) {
    throw new Error("Mappenavn er påkrevd.");
  }

  return prisma.docFolder.create({
    data: {
      customerId: params.customerId,
      parentId: parent.id,
      name,
      kind: "CUSTOM",
      projectId: parent.projectId,
      createdById: params.createdById,
    },
  });
}

export async function renameCustomFolder(params: {
  customerId: number;
  folderId: string;
  name: string;
}) {
  const folder = await getDocumentFolder(params.folderId);
  if (!folder || folder.customerId !== params.customerId) {
    throw new Error("Mappen finnes ikke.");
  }
  if (folder.kind !== "CUSTOM") {
    throw new Error("Faste mapper og prosjektmapper kan ikke omdøpes.");
  }

  const name = params.name.trim();
  if (!name) {
    throw new Error("Mappenavn er påkrevd.");
  }

  return prisma.docFolder.update({
    where: { id: params.folderId },
    data: { name },
  });
}

export async function deleteCustomFolder(params: {
  customerId: number;
  folderId: string;
}) {
  const folder = await getDocumentFolder(params.folderId);
  if (!folder || folder.customerId !== params.customerId) {
    throw new Error("Mappen finnes ikke.");
  }
  if (folder.kind !== "CUSTOM") {
    throw new Error("Faste mapper og prosjektmapper kan ikke slettes.");
  }

  await prisma.docFolder.delete({ where: { id: params.folderId } });
}

function buildTree(
  folders: Array<{
    id: string;
    customerId: number;
    parentId: string | null;
    name: string;
    kind: FolderKind;
    systemKey: string | null;
    projectId: string | null;
    createdAt: Date;
    updatedAt: Date;
    files: Array<{
      id: string;
      name: string;
      storageKey: string | null;
      sizeBytes: number | null;
      contentType: string | null;
      createdAt: Date;
      uploadedBy: { name: string | null; email: string | null } | null;
    }>;
  }>,
): DocumentFolderNode[] {
  const byId = new Map<string, DocumentFolderNode>();
  const roots: DocumentFolderNode[] = [];

  for (const folder of folders) {
    byId.set(folder.id, {
      id: folder.id,
      customerId: folder.customerId,
      parentId: folder.parentId,
      name: folder.name,
      kind: folder.kind,
      systemKey: folder.systemKey,
      projectId: folder.projectId,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
      files: folder.files.map((file) => ({
        id: file.id,
        name: file.name,
        storageKey: file.storageKey,
        sizeBytes: file.sizeBytes,
        contentType: file.contentType,
        uploadedByName: file.uploadedBy?.name ?? file.uploadedBy?.email ?? null,
        createdAt: file.createdAt.toISOString(),
      })),
      children: [],
    });
  }

  for (const folder of byId.values()) {
    if (folder.parentId && byId.has(folder.parentId)) {
      byId.get(folder.parentId)!.children.push(folder);
    } else {
      roots.push(folder);
    }
  }

  sortTree(roots);
  return roots;
}

function sortTree(folders: DocumentFolderNode[]) {
  folders.sort((a, b) => folderSortValue(a) - folderSortValue(b) || a.name.localeCompare(b.name, "nb"));
  for (const folder of folders) {
    sortTree(folder.children);
  }
}

function folderSortValue(folder: DocumentFolderNode) {
  if (!folder.systemKey) return 1000;
  return SYSTEM_SORT_ORDER.get(folder.systemKey) ?? 999;
}
