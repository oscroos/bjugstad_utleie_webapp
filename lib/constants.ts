// lib/constants.ts
// Purpose: Central place for app-wide constants.

// Whether the app is running in development mode.
export const IS_DEV = process.env.NODE_ENV === "development";

// Whether the app is running in production mode.
export const IS_PROD = process.env.NODE_ENV === "production";

// Simple DEV toggle for bypassing Vipps.
// Set to `false` to restore the normal Vipps login flow locally.
export const DEV_VIPPS_BYPASS_ENABLED: boolean = true;

// Implementation flag used by auth/login code.
export const USE_CREDENTIALS_PROVIDER_FOR_DEV_ONLY = DEV_VIPPS_BYPASS_ENABLED;
export const DEV_BYPASS_USER_ID = "cmic0pmax0000ume0vhr3dwol";
export const DEV_BYPASS_USER_PHONE = "+4745938863";
export const DEV_BYPASS_USER_NAME = "John Doe";

// Vipps OAuth scope to request additional user data.
export const VIPPS_DATA_REQUESTS = "openid name email phoneNumber address"

// Session lifetime and refresh cadence (seconds). Used by NextAuth session config.
export const SESSION_MAX_AGE_SECONDS = 5 * 60 * 60; // 5 hours (before user is automatically signed out)
export const SESSION_UPDATE_AGE_SECONDS = 30 * 60;  // refresh token every 30 minutes

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
