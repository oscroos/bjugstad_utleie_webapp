import type { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface User extends DefaultUser {
    role?: string | null;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      phone?: string | null;
      company?: string | null;
      role?: string | null;
      address_street?: string | null;
      address_postal_code?: string | null;
      address_region?: string | null;
      createdAt?: string | Date | null;
      updatedAt?: string | Date | null;
      acceptedTerms?: boolean;
      acceptedTermsVersion?: string | null;
      lastLoginAt?: string | Date | null;
      accesses?: {
        customerId: number;
        role: string;
        customer?: {
          name?: string | null;
          customer_number?: number | null;
        } | null;
      }[];
    };
  }
}
