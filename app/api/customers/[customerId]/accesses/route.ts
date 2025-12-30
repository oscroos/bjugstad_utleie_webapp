import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const session = await auth();

  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { customerId: rawCustomerId } = await params;
  const customerId = Number.parseInt(rawCustomerId, 10);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: "Ugyldig kunde-id" }, { status: 400 });
  }

  try {
    const accesses = await prisma.userCustomerAccess.findMany({
      where: { customerId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    const items = accesses.map((access) => ({
      userId: access.userId,
      role: access.role,
      name: access.user?.name ?? null,
      phone: access.user?.phone ?? null,
      email: access.user?.email ?? null,
    }));

    return NextResponse.json({ accesses: items });
  } catch (error) {
    console.error(
      `Failed to fetch accesses for customer ${customerId}`,
      error,
    );
    return NextResponse.json(
      { error: "Kunne ikke hente kundetilganger" },
      { status: 500 },
    );
  }
}

type UpdateAccess = { userId: string; role: "admin" | "user" };

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const session = await auth();

  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { customerId: rawCustomerId } = await params;
  const customerId = Number.parseInt(rawCustomerId, 10);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: "Ugyldig kunde-id" }, { status: 400 });
  }

  let payload: { accesses?: UpdateAccess[] };
  try {
    payload = (await request.json()) as { accesses?: UpdateAccess[] };
  } catch {
    return NextResponse.json({ error: "Ugyldig payload" }, { status: 400 });
  }

  const accesses = Array.isArray(payload.accesses) ? payload.accesses : [];
  const normalized: UpdateAccess[] = [];
  for (const entry of accesses) {
    if (!entry?.userId || typeof entry.userId !== "string") continue;
    if (entry.role !== "admin" && entry.role !== "user") continue;
    normalized.push({ userId: entry.userId, role: entry.role });
  }

  try {
    await prisma.$transaction([
      prisma.userCustomerAccess.deleteMany({
        where: { customerId },
      }),
      ...(normalized.length
        ? [
          prisma.userCustomerAccess.createMany({
            data: normalized.map((entry) => ({
              userId: entry.userId,
              customerId,
              role: entry.role,
            })),
          }),
        ]
        : []),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      `Failed to update accesses for customer ${customerId}`,
      error,
    );
    return NextResponse.json(
      { error: "Kunne ikke oppdatere kundetilganger" },
      { status: 500 },
    );
  }
}
