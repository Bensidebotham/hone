import { describe, it, expect, vi } from "vitest";
import { fetchSiteText } from "@/lib/profile/fetch-site";

describe("fetchSiteText", () => {
  it("returns stripped text from a normal site", async () => {
    const f = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "<h1>Hi</h1><p>I build apps</p>",
    });
    expect(
      await fetchSiteText("https://myportfolio.dev", { fetchFn: f as any })
    ).toBe("Hi I build apps");
  });

  it("throws on bad response", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false });
    await expect(
      fetchSiteText("https://myportfolio.dev", { fetchFn: f as any })
    ).rejects.toThrow();
  });

  it("rejects LinkedIn and other blocklisted domains (paste-only)", async () => {
    const f = vi.fn();
    await expect(
      fetchSiteText("https://www.linkedin.com/in/someone", { fetchFn: f as any })
    ).rejects.toThrow(/paste/i);
    await expect(
      fetchSiteText("https://indeed.com/x", { fetchFn: f as any })
    ).rejects.toThrow();
    expect(f).not.toHaveBeenCalled(); // never even attempts the fetch
  });

  it("rejects non-http(s) schemes", async () => {
    const f = vi.fn();
    await expect(
      fetchSiteText("file:///etc/passwd", { fetchFn: f as any })
    ).rejects.toThrow();
    await expect(
      fetchSiteText("ftp://x.com", { fetchFn: f as any })
    ).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });

  it("rejects internal/private hosts (SSRF guard)", async () => {
    const f = vi.fn();
    await expect(
      fetchSiteText("http://localhost:3000", { fetchFn: f as any })
    ).rejects.toThrow();
    await expect(
      fetchSiteText("http://127.0.0.1", { fetchFn: f as any })
    ).rejects.toThrow();
    await expect(
      fetchSiteText("http://169.254.169.254/latest/meta-data", { fetchFn: f as any })
    ).rejects.toThrow();
    await expect(
      fetchSiteText("http://192.168.1.10", { fetchFn: f as any })
    ).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
});
