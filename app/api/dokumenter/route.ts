import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  requireCustomerAccess,
  requireProjectRole,
  writeAuditLog,
} from "@/lib/access";
import {
  createProjectFolder,
  createSubfolder,
  deleteCustomFolder,
  getDocumentFolder,
  isDocumentStorageConfigured,
  listDocumentCustomersForUser,
  listDocumentProjectsForCustomer,
  listDocumentTree,
  listProjectDocumentTree,
  renameCustomFolder,
} from "@/lib/documents";

export async function GET(request: Request) {
  const session = await requireAuthenticatedUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(request.url).searchParams;
  const projectId = stringValue(searchParams.get("projectId"));

  if (projectId) {
    const access = await requireProjectRole(projectId, "VIEWER");
    if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

    const [customers, projects, tree] = await Promise.all([
      listDocumentCustomersForUser(session.user.id, session.user.role),
      listDocumentProjectsForCustomer(access.project.customerId),
      listProjectDocumentTree(access.project.customerId, projectId),
    ]);

    return NextResponse.json({
      activeCustomerId: access.project.customerId,
      projectId,
      customers,
      projects,
      tree,
      storageConfigured: isDocumentStorageConfigured(),
    });
  }

  const customers = await listDocumentCustomersForUser(session.user.id, session.user.role);
  if (customers.length === 0) {
    return NextResponse.json({
      activeCustomerId: null,
      customers,
      projects: [],
      tree: [],
      storageConfigured: isDocumentStorageConfigured(),
    });
  }

  const requestedCustomerId = integerValue(searchParams.get("customerId"), 0);
  const activeCustomerId = requestedCustomerId || customers[0].id;
  const access = await requireCustomerAccess(activeCustomerId, "user");
  if (!access) return NextResponse.json({ error: "Du har ikke tilgang til valgt kunde" }, { status: 403 });

  const [projects, tree] = await Promise.all([
    listDocumentProjectsForCustomer(activeCustomerId),
    listDocumentTree(activeCustomerId),
  ]);

  return NextResponse.json({
    activeCustomerId,
    customers,
    projects,
    tree,
    storageConfigured: isDocumentStorageConfigured(),
  });
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });

  try {
    const action = stringValue(body.action);
    if (action === "createProjectFolder") {
      const projectId = stringValue(body.projectId);
      if (!projectId) return NextResponse.json({ error: "Velg prosjekt" }, { status: 400 });

      const access = await requireProjectRole(projectId, "PROJECT_MANAGER");
      if (!access) return NextResponse.json({ error: "Krever prosjekttilgang" }, { status: 403 });

      const folder = await createProjectFolder({
        customerId: access.project.customerId,
        projectId,
        createdById: session.user.id,
      });

      await writeAuditLog({
        customerId: access.project.customerId,
        userId: session.user.id,
        action: "document.folder.project.create",
        entityType: "DocFolder",
        entityId: folder.id,
        metadata: { projectId },
      });

      return NextResponse.json({ folder }, { status: 201 });
    }

    if (action === "createFolder") {
      const parentId = stringValue(body.parentId);
      const name = stringValue(body.name);
      if (!parentId || !name) {
        return NextResponse.json({ error: "Mappenavn og overmappe er påkrevd" }, { status: 400 });
      }

      const parent = await getDocumentFolder(parentId);
      const permission = await canEditFolder(parent);
      if (!permission.ok) return permission.response;

      const folder = await createSubfolder({
        customerId: parent!.customerId,
        parentId,
        name,
        createdById: session.user.id,
      });

      await writeAuditLog({
        customerId: parent!.customerId,
        userId: session.user.id,
        action: "document.folder.create",
        entityType: "DocFolder",
        entityId: folder.id,
        metadata: { parentId },
      });

      return NextResponse.json({ folder }, { status: 201 });
    }

    return NextResponse.json({ error: "Ukjent dokumenthandling" }, { status: 400 });
  } catch (error) {
    return handleKnownError(error, "Kunne ikke opprette mappe");
  }
}

export async function PATCH(request: Request) {
  const session = await requireAuthenticatedUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });

  const folderId = stringValue(body.folderId);
  const name = stringValue(body.name);
  if (!folderId || !name) {
    return NextResponse.json({ error: "Mappenavn og mappe er påkrevd" }, { status: 400 });
  }

  try {
    const folder = await getDocumentFolder(folderId);
    const permission = await canEditFolder(folder);
    if (!permission.ok) return permission.response;

    const updatedFolder = await renameCustomFolder({
      customerId: folder!.customerId,
      folderId,
      name,
    });

    await writeAuditLog({
      customerId: folder!.customerId,
      userId: session.user.id,
      action: "document.folder.rename",
      entityType: "DocFolder",
      entityId: folderId,
    });

    return NextResponse.json({ folder: updatedFolder });
  } catch (error) {
    return handleKnownError(error, "Kunne ikke omdøpe mappe");
  }
}

export async function DELETE(request: Request) {
  const session = await requireAuthenticatedUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });

  const folderId = stringValue(body.folderId);
  if (!folderId) return NextResponse.json({ error: "Mappe er påkrevd" }, { status: 400 });

  try {
    const folder = await getDocumentFolder(folderId);
    const permission = await canEditFolder(folder);
    if (!permission.ok) return permission.response;

    await deleteCustomFolder({ customerId: folder!.customerId, folderId });

    await writeAuditLog({
      customerId: folder!.customerId,
      userId: session.user.id,
      action: "document.folder.delete",
      entityType: "DocFolder",
      entityId: folderId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleKnownError(error, "Kunne ikke slette mappe");
  }
}

async function canEditFolder(
  folder: Awaited<ReturnType<typeof getDocumentFolder>>,
): Promise<
  | { ok: true }
  | {
      ok: false;
      response: NextResponse;
    }
> {
  if (!folder) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Mappen finnes ikke" }, { status: 404 }),
    };
  }

  if (folder.projectId) {
    const access = await requireProjectRole(folder.projectId, "PROJECT_MANAGER");
    if (!access) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Krever prosjekttilgang" }, { status: 403 }),
      };
    }
    return { ok: true };
  }

  const access = await requireCustomerAccess(folder.customerId, "admin");
  if (!access) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Krever kundeadmin" }, { status: 403 }),
    };
  }

  return { ok: true };
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function handleKnownError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function integerValue(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
