// lib/constants.ts
// Purpose: Central place for app-wide constants.

// Whether the app is running in development mode.
export const IS_DEV = process.env.NODE_ENV === "development";

// Whether the app is running in production mode.
export const IS_PROD = process.env.NODE_ENV === "production";

// Whether to enable the Credentials provider for DEV (skips Vipps login).
export const USE_CREDENTIALS_PROVIDER_FOR_DEV_ONLY: boolean = false;

// Vipps OAuth scope to request additional user data.
export const VIPPS_DATA_REQUESTS = "openid name email phoneNumber address"

// Version label for the currently published terms/conditions PDF shown in onboarding.
export const LATEST_TERMS_VERSION = "v1";

// Fields to include in the NextAuth session user object, accesible via `session.user`.
export const SESSION_USER_FIELDS = [
    "name",
    "email",
    "phone",
    "company",
    "role",
    "address_street",
    "address_postal_code",
    "address_region",
    "createdAt",
    "updatedAt",
    "acceptedTermsVersion",
    "lastLoginAt",
] as const;
