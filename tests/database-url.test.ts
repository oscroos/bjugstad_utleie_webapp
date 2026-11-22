import { describe, expect, it } from "vitest";
import { withStrictTls } from "@/lib/database-url";

describe("certificate verification for the Prisma connection", () => {
  it("adds sslaccept=strict when the URL asks for TLS", () => {
    expect(withStrictTls("postgresql://u:p@host:5432/db?sslmode=require")).toBe(
      "postgresql://u:p@host:5432/db?sslmode=require&sslaccept=strict",
    );
    expect(withStrictTls("postgresql://u:p@host/db?schema=public&sslmode=require&connection_limit=5")).toBe(
      "postgresql://u:p@host/db?schema=public&sslmode=require&connection_limit=5&sslaccept=strict",
    );
  });

  it("leaves an explicit sslaccept choice alone", () => {
    const optedOut = "postgresql://u:p@localhost/db?sslmode=require&sslaccept=accept_invalid_certs";
    expect(withStrictTls(optedOut)).toBe(optedOut);
  });

  it("leaves URLs without TLS alone", () => {
    expect(withStrictTls("postgresql://u:p@localhost:5432/db")).toBe("postgresql://u:p@localhost:5432/db");
    expect(withStrictTls("postgresql://u:p@localhost/db?sslmode=disable")).toBe(
      "postgresql://u:p@localhost/db?sslmode=disable",
    );
    expect(withStrictTls(undefined)).toBeUndefined();
  });

  it("does not react to a password that happens to contain the parameter name", () => {
    const url = "postgresql://u:sslmode=require@localhost/db";
    expect(withStrictTls(url)).toBe(url);
  });
});
