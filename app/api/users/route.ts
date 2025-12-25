import { NextResponse } from "next/server";
import { CompanyRole, GlobalRole, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RelationshipInput = {
  companyId: number | string;
  role: string;
};

type CreateUserPayload = {
  phone?: string;
  role?: string;
  relationships?: RelationshipInput[];
};

export async function GET(_request: Request) {
  const session = await auth();

  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    // TODO: Fetch company relationships as well
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
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
        lastLoginAt: true,
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

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Failed to fetch users", error);
    return NextResponse.json(
      { error: "Kunne ikke hente brukere" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let payload: CreateUserPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON payload" }, { status: 400 });
  }

  const normalizedRole = normalizeGlobalRole(payload.role);
  if (!normalizedRole) {
    return NextResponse.json({ error: "Ugyldig rolle" }, { status: 400 });
  }

  const normalizedPhone = normalizePhone(payload.phone);
  if (!normalizedPhone) {
    return NextResponse.json(
      { error: "Telefonnummer mangler eller har feil format" },
      { status: 400 },
    );
  }

  // Validate and normalize company relationships (only relevant for customer role)
  const relationshipInputs = Array.isArray(payload.relationships) ? payload.relationships : [];
  const normalizedRelationships =
    normalizedRole === "customer"
      ? normalizeRelationships(relationshipInputs)
      : [];

  if (normalizedRole === "customer" && normalizedRelationships.length === 0) {
    return NextResponse.json(
      { error: "Kunder maa knyttes til minst ett selskap" },
      { status: 400 },
    );
  }

  try {
    // Make sure phone is unique
    const existing = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "En bruker med dette telefonnummeret finnes allerede" },
        { status: 409 },
      );
    }

    // Verify that referenced companies exist
    if (normalizedRelationships.length) {
      const companyIds = [...new Set(normalizedRelationships.map((rel) => rel.customerId))];
      const foundCompanies = await prisma.customer.findMany({
        where: { customer_id: { in: companyIds } },
        select: { customer_id: true },
      });

      const missingCompanies = companyIds.filter(
        (id) => !foundCompanies.some((company) => company.customer_id === id),
      );

      if (missingCompanies.length) {
        return NextResponse.json(
          {
            error: `Fant ikke selskap med id: ${missingCompanies.join(", ")}`,
          },
          { status: 400 },
        );
      }
    }

    const createdUser = await prisma.user.create({
      data: {
        role: normalizedRole,
        phone: normalizedPhone,
        accesses:
          normalizedRelationships.length > 0
            ? {
              create: normalizedRelationships.map((rel) => ({
                customerId: rel.customerId,
                role: rel.role,
              })),
            }
            : undefined,
      },
      select: {
        id: true,
        role: true,
        phone: true,
        accesses: {
          select: {
            customerId: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json({ user: createdUser }, { status: 201 });
  } catch (error) {
    console.error("Failed to create user", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Telefonnummeret er allerede i bruk" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Kunne ikke lagre bruker" },
      { status: 500 },
    );
  }
}

function normalizeGlobalRole(role?: string | null): GlobalRole | null {
  if (role === "customer" || role === "super_admin") {
    return role;
  }
  return null;
}

function normalizePhone(input?: string | null): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim().replace(/\s+/g, "");
  if (!/^\+?\d+$/.test(trimmed)) return null;
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

function normalizeRelationships(
  relationships: RelationshipInput[],
): { customerId: number; role: CompanyRole }[] {
  const seen = new Set<number>();
  const normalized: { customerId: number; role: CompanyRole }[] = [];

  for (const rel of relationships) {
    const customerId = typeof rel.companyId === "string"
      ? Number.parseInt(rel.companyId, 10)
      : rel.companyId;

    const mappedRole = mapCompanyRole(rel.role);

    if (!Number.isInteger(customerId) || customerId <= 0) continue;
    if (!mappedRole) continue;
    if (seen.has(customerId)) continue;

    seen.add(customerId);
    normalized.push({ customerId, role: mappedRole });
  }

  return normalized;
}

function mapCompanyRole(role: string | undefined): CompanyRole | null {
  switch (role) {
    case "admin":
    case "selskapsadmin":
      return "admin";
    case "user":
    case "selskapsbruker":
      return "user";
    default:
      return null;
  }
}
