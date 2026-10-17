import { describe, expect, it } from "vitest";
import { secretsMatch } from "../lib/telemetry/config";

describe("GPS ingest secret comparison", () => {
  it("accepts only an exact non-empty match", () => {
    expect(secretsMatch("correct-secret", "correct-secret")).toBe(true);
    expect(secretsMatch("wrong-secret", "correct-secret")).toBe(false);
    expect(secretsMatch(null, "correct-secret")).toBe(false);
  });
});
