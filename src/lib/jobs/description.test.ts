import { describe, it, expect } from "vitest";
import { cleanDescription } from "./description";

describe("cleanDescription", () => {
  it("decodes entity-encoded HTML (Greenhouse) into sanitized html + plain text", () => {
    const raw = "&lt;h2&gt;&lt;strong&gt;Who we are&lt;/strong&gt;&lt;/h2&gt;&lt;p&gt;Build &amp; ship.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;APIs&lt;/li&gt;&lt;/ul&gt;";
    const { html, text } = cleanDescription(raw);
    expect(html).toContain("<h2>");
    expect(html).toContain("<strong>Who we are</strong>");
    expect(html).toContain("<li>APIs</li>");
    expect(text).toContain("Who we are");
    expect(text).toContain("Build & ship.");
    expect(text).not.toContain("<");        // plain text has no tags
    expect(text).not.toContain("&lt;");     // and no encoded tags
  });

  it("handles real HTML (Lever/Ashby) without double-decoding tags", () => {
    const raw = "<p>Work with <strong>Go</strong> &amp; Rust.</p>";
    const { html, text } = cleanDescription(raw);
    expect(html).toContain("<strong>Go</strong>");
    expect(text).toBe("Work with Go & Rust.");
  });

  it("strips disallowed/dangerous tags", () => {
    const raw = "<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1)>";
    const { html } = cleanDescription(raw);
    expect(html).not.toContain("script");
    expect(html).not.toContain("onerror");
  });

  it("returns empty strings for empty input", () => {
    expect(cleanDescription("")).toEqual({ html: "", text: "" });
  });
});
