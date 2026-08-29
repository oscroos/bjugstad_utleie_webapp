import { NextResponse } from "next/server";
import {
  requireCustomerAccess,
  requireProjectRole,
  requireAuthenticatedUser,
} from "@/lib/access";
import { getDocumentFolder } from "@/lib/documents";

export async function POST(request: Request) {
  const session = await requireAuthenticatedUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJsonObject(request);
  const folderId = stringValue(body?.folderId);

  if (folderId) {
    const folder = await getDocumentFolder(folderId);
    if (!folder) return NextResponse.json({ error: "Mappen finnes ikke" }, { status: 404 });

    const access = folder.projectId
      ? await requireProjectRole(folder.projectId, "PROJECT_MANAGER")
      : await requireCustomerAccess(folder.customerId, "user");

    if (!access) {
      return NextResponse.json({ error: "Du har ikke tilgang til denne mappen" }, { status: 403 });
    }
  }

  return NextResponse.json(
    {
      error: "Filopplasting er ikke aktivert ennå.",
      details:
        "Dette er en Phase 3-placeholder. Når Azure Blob-lagring er konfigurert, skal denne ruten laste opp filen, lagre blob-nøkkel på DocFile og gjøre filen tilgjengelig i dokumenthotellet.",
    },
    { status: 501 },
  );
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
