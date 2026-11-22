// lib/prisma.ts
// Purpose: Create and export a single PrismaClient instance.
// In development, attach it to the global object to avoid
// creating multiple instances during hot reloads.
import { PrismaClient } from "@prisma/client";
import { IS_DEV } from "./constants";
import { withStrictTls } from "./database-url";

declare global {
  // allow global prisma in dev to avoid multiple instances
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    log: IS_DEV ? ["query", "error", "warn"] : ["error"],
    // Same URL as DATABASE_URL, with certificate verification switched on.
    datasourceUrl: withStrictTls(process.env.DATABASE_URL),
  });

if (IS_DEV) global.prisma = prisma;
