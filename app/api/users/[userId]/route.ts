import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "Ugyldig bruker-id" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      role: true,
      phone: true,
      email: true,
      address_street: true,
      address_postal_code: true,
      address_region: true,
      createdAt: true,
      updatedAt: true,
      acceptedTerms: true,
      acceptedTermsAt: true,
      accesses: {
        select: {
          customerId: true,
          role: true,
          customer: {
            select: {
              name: true,
              customer_number: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  }

  return NextResponse.json({ user });
}

type UpdateAccess = { customerId: number; role: "admin" | "user" };

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "Ugyldig bruker-id" }, { status: 400 });
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
    if (!entry?.customerId || !Number.isInteger(entry.customerId)) continue;
    if (entry.role !== "admin" && entry.role !== "user") continue;
    normalized.push({ customerId: entry.customerId, role: entry.role });
  }

  try {
    await prisma.$transaction([
      prisma.userCustomerAccess.deleteMany({ where: { userId } }),
      ...(normalized.length
        ? [
          prisma.userCustomerAccess.createMany({
            data: normalized.map((entry) => ({
              userId,
              customerId: entry.customerId,
              role: entry.role,
            })),
          }),
        ]
        : []),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`Failed to update accesses for user ${userId}`, error);
    return NextResponse.json(
      { error: "Kunne ikke oppdatere brukertilgangene" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "Ugyldig bruker-id" }, { status: 400 });
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`Failed to delete user ${userId}`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
    }
    return NextResponse.json({ error: "Kunne ikke slette bruker" }, { status: 500 });
  }
}
