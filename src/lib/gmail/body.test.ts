import { describe, it, expect } from "vitest";
import { cleanEmailBody } from "@/lib/gmail/body";

const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const NBSP = String.fromCharCode(0x00a0);

describe("cleanEmailBody", () => {
  it("normalises CRLF and collapses long blank runs", () => {
    expect(cleanEmailBody("Hi there\r\n\r\n\r\n\r\nThanks,\r\nNVIDIA")).toBe(
      "Hi there\n\nThanks,\nNVIDIA"
    );
  });

  it("turns non-breaking spaces into real ones so the preview can wrap", () => {
    expect(cleanEmailBody(`We${NBSP}received your${NBSP}application`)).toBe(
      "We received your application"
    );
  });

  it("drops zero-width padding and trailing soft-wrap whitespace", () => {
    expect(cleanEmailBody(`Next${ZERO_WIDTH_SPACE} steps   \nthis week`)).toBe(
      "Next steps\nthis week"
    );
  });

  it("trims surrounding whitespace", () => {
    expect(cleanEmailBody("\n\n  Hello  \n\n")).toBe("Hello");
  });

  it("is safe on an empty body", () => {
    expect(cleanEmailBody("")).toBe("");
  });
});
