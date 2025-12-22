// app/api/onboarding/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LATEST_TERMS_VERSION } from "@/lib/constants";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      address_street: true,
      address_postal_code: true,
      address_region: true,
      acceptedTerms: true,
      acceptedTermsVersion: true,
      lastLoginAt: true,
      accesses: {
        select: {
          role: true,
          customer: {
            select: {
              customer_id: true,
              name: true,
              organization_number: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { accesses, ...userDetails } = user;
  const companies = accesses.map((access) => ({
    role: access.role,
    customerId: access.customer.customer_id,
    companyName: access.customer.name,
    organizationNumber: access.customer.organization_number,
  }));

  return NextResponse.json({
    user: userDetails,
    companies,
    termsVersion: LATEST_TERMS_VERSION,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  const versionFromClient = payload?.acceptedTermsVersion;

  if (versionFromClient && versionFromClient !== LATEST_TERMS_VERSION) {
    return NextResponse.json({ error: "terms_outdated" }, { status: 409 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      acceptedTerms: true,
      acceptedTermsAt: new Date(),
      acceptedTermsVersion: LATEST_TERMS_VERSION,
      lastLoginAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, termsVersion: LATEST_TERMS_VERSION });
}
