declare module "next-auth" {
  interface User {
    role?: string | null;
  }

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
