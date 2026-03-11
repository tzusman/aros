import { describe, it, expect } from "vitest";
import { matchMime } from "../modules/mime-match.js";

describe("matchMime", () => {
  it("matches exact types", () => {
    expect(matchMime("text/markdown", "text/markdown")).toBe(true);
    expect(matchMime("text/markdown", "text/plain")).toBe(false);
  });

  it("matches wildcard subtypes", () => {
    expect(matchMime("text/markdown", "text/*")).toBe(true);
    expect(matchMime("text/plain", "text/*")).toBe(true);
    expect(matchMime("image/png", "text/*")).toBe(false);
  });

  it("matches universal wildcard", () => {
    expect(matchMime("text/markdown", "*/*")).toBe(true);
    expect(matchMime("image/png", "*/*")).toBe(true);
  });

  it("matches image types", () => {
    expect(matchMime("image/png", "image/*")).toBe(true);
    expect(matchMime("image/jpeg", "image/*")).toBe(true);
    expect(matchMime("text/plain", "image/*")).toBe(false);
  });
});
