import { prisma } from "@/lib/prisma";
import { normalizeError, type AppError } from "@/lib/errors";

export type UserAccessPayload = {
  customerId: number;
  role: string;
  customer: {
    name: string | null;
    customer_number: number | null;
  } | null;
};

export type UserPayload = {
  id: string;
  name: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
  address_street: string | null;
  address_postal_code: string | null;
  address_region: string | null;
  createdAt: string;
  updatedAt: string;
  acceptedTerms: boolean;
  acceptedTermsAt: string | null;
  lastLoginAt: string | null;
  accesses: UserAccessPayload[];
};

export type UsersResult = {
  users: UserPayload[];
  error: AppError | null;
};

export async function loadUsersForAdmin(): Promise<UsersResult> {
  try {
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

    return {
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        role: user.role,
        phone: user.phone,
        email: user.email,
        address_street: user.address_street,
        address_postal_code: user.address_postal_code,
        address_region: user.address_region,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        acceptedTerms: user.acceptedTerms,
        acceptedTermsAt: user.acceptedTermsAt ? user.acceptedTermsAt.toISOString() : null,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        accesses: user.accesses.map((access) => ({
          customerId: access.customerId,
          role: access.role,
          customer: access.customer
            ? {
                name: access.customer.name,
                customer_number: access.customer.customer_number,
              }
            : null,
        })),
      })),
      error: null,
    };
  } catch (error) {
    return {
      users: [],
      error: normalizeError(error, {
        title: "Kunne ikke hente brukere",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Vi kunne ikke laste brukerlisten akkurat na. Prov igjen.",
      }),
    };
  }
}
