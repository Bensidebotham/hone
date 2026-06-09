import { describe, it, expect } from "vitest";
import { parseLocation } from "./enrich";

describe("parseLocation", () => {
  it("detects US from a state code", () => {
    expect(parseLocation("New York, NY")).toEqual({ country: "US", isRemote: false });
  });
  it("detects US from a known city without state", () => {
    expect(parseLocation("San Francisco")).toEqual({ country: "US", isRemote: false });
  });
  it("detects US from an explicit marker", () => {
    expect(parseLocation("Austin, United States")).toEqual({ country: "US", isRemote: false });
  });
  it("flags remote and still resolves US", () => {
    expect(parseLocation("Remote (US)")).toEqual({ country: "US", isRemote: true });
  });
  it("flags remote with no resolvable country", () => {
    expect(parseLocation("Remote")).toEqual({ country: null, isRemote: true });
  });
  it("returns null country for a foreign location", () => {
    expect(parseLocation("London, UK")).toEqual({ country: null, isRemote: false });
  });
  it("returns null country for ambiguous text", () => {
    expect(parseLocation("Worldwide")).toEqual({ country: null, isRemote: false });
  });
  it("handles null input", () => {
    expect(parseLocation(null)).toEqual({ country: null, isRemote: false });
  });
});
