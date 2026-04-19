import { describe, it, expect } from "vitest";
import { fmtUsd, fmtPct, c } from "../../../src/config/logger.js";

describe("fmtUsd", () => {
  it("formats billions", () => expect(fmtUsd(1_500_000_000)).toBe("$1.50B"));
  it("formats millions", () => expect(fmtUsd(2_300_000)).toBe("$2.30M"));
  it("formats thousands", () => expect(fmtUsd(12_500)).toBe("$12.50K"));
  it("formats small values to 4dp", () => expect(fmtUsd(0.0012)).toBe("$0.0012"));
  it("returns ? for null", () => expect(fmtUsd(null)).toBe("?"));
  it("returns ? for undefined", () => expect(fmtUsd(undefined)).toBe("?"));
  it("respects custom prefix", () => expect(fmtUsd(1_000, "€")).toBe("€1.00K"));
  it("handles negative billions", () => expect(fmtUsd(-2_000_000_000)).toBe("$-2.00B"));
  it("handles exact 1M boundary", () => expect(fmtUsd(1_000_000)).toBe("$1.00M"));
  it("handles exact 1K boundary", () => expect(fmtUsd(1_000)).toBe("$1.00K"));
});

describe("fmtPct", () => {
  it("prefixes positive with +", () => expect(fmtPct(5.5)).toBe("+5.50%"));
  it("no sign prefix for negative", () => expect(fmtPct(-3.2)).toBe("-3.20%"));
  it("formats zero without sign (n > 0 check is strict)", () => expect(fmtPct(0)).toBe("0.00%"));
  it("returns ?% for null", () => expect(fmtPct(null)).toBe("?%"));
  it("returns ?% for undefined", () => expect(fmtPct(undefined)).toBe("?%"));
  it("rounds to 2 decimal places", () => expect(fmtPct(1.23456)).toBe("+1.23%"));
});

describe("color palette c", () => {
  const requiredKeys = [
    "reset", "bold", "dim", "cyan", "yellow", "green",
    "brightGreen", "red", "magenta", "blue", "white",
  ];

  it("exports all required color keys as strings", () => {
    for (const key of requiredKeys) {
      expect(c).toHaveProperty(key);
      expect(typeof (c as Record<string, string>)[key]).toBe("string");
    }
  });
});
