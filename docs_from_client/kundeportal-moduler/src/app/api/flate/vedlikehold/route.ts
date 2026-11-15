import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Vedlikeholdsoversikt (MachineMax/Trackunit-paritet). Statusoppdatering fra
// telemetri-timetellere: sett DUE når engineHours nærmer seg dueAtHours –
// kjøres i telemetri-cronen (integrasjonspunkt).
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const tasks = await prisma.maintenanceTask.findMany({ orderBy: [{ status: "desc" }, { dueDate: "asc" }], take: 200 });
  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  if (!b.machineId || !b.title?.trim()) return NextResponse.json({ error: "machineId og tittel er påkrevd." }, { status: 400 });
  const task = await prisma.maintenanceTask.create({
    data: { machineId: b.machineId, title: b.title.trim(), dueAtHours: b.dueAtHours ?? null, dueDate: b.dueDate ? new Date(b.dueDate) : null },
  });
  return NextResponse.json({ task }, { status: 201 });
}
