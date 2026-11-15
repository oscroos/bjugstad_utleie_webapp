import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listProjectsForOrg } from "@/lib/prosjekter/queries";

// GET /api/prosjekter  → prosjekter for innlogget organisasjon (til dropdown/liste)
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const projects = await listProjectsForOrg(session.user.organizationId);
  return NextResponse.json({ projects });
}

// POST /api/prosjekter  → opprett nytt prosjekt
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }

  const body = await req.json();
  const { projectNumber, name } = body ?? {};

  if (!projectNumber?.trim() || !name?.trim()) {
    return NextResponse.json(
      { error: "Prosjektnummer og navn er påkrevd." },
      { status: 400 }
    );
  }

  try {
    const project = await prisma.project.create({
      data: {
        projectNumber: projectNumber.trim(),
        name: name.trim(),
        description: body.description ?? null,
        addressLine: body.addressLine ?? null,
        postalCode: body.postalCode ?? null,
        city: body.city ?? null,
        clientName: body.clientName ?? null,
        clientOrgNumber: body.clientOrgNumber ?? null,
        clientContactName: body.clientContactName ?? null,
        clientContactEmail: body.clientContactEmail ?? null,
        clientContactPhone: body.clientContactPhone ?? null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        organizationId: session.user.organizationId,
        createdById: session.user.id,
        // Oppretter alltid oppretteren som eier-deltaker
        participants: {
          create: { userId: session.user.id, role: "OWNER" },
        },
      },
      select: { id: true, projectNumber: true, name: true },
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (err: unknown) {
    // Unik constraint = duplikat prosjektnummer for organisasjonen
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Prosjektnummeret finnes allerede." },
        { status: 409 }
      );
    }
    console.error("Feil ved oppretting av prosjekt:", err);
    return NextResponse.json({ error: "Kunne ikke opprette prosjekt." }, { status: 500 });
  }
}
