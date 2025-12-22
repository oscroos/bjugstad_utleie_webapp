import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
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
    };
  }
}
