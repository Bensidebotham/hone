import { describe, it, expect, vi } from "vitest";
import { analyze } from "@/lib/ai/provider";

describe("analyze", () => {
  it("returns parsed JSON from the model", async () => {
    const fakeClient = {
      generateContent: vi.fn().mockResolvedValue({
        text: '{"score":80,"suggestions":["x"]}',
      }),
    };
    const out = await analyze(
      { system: "s", prompt: "p" },
      { client: fakeClient }
    );
    expect(out).toEqual({ score: 80, suggestions: ["x"] });
  });

  it("passes system and prompt text through to generateContent", async () => {
    const fakeClient = {
      generateContent: vi.fn().mockResolvedValue({ text: "null" }),
    };
    await analyze({ system: "sys", prompt: "pmt" }, { client: fakeClient });
    const callArg = fakeClient.generateContent.mock.calls[0][0];
    expect(callArg.contents).toContain("sys");
    expect(callArg.contents).toContain("pmt");
  });

  it("throws when response.text is undefined", async () => {
    const fakeClient = {
      generateContent: vi.fn().mockResolvedValue({ text: undefined }),
    };
    await expect(
      analyze({ system: "s", prompt: "p" }, { client: fakeClient })
    ).rejects.toThrow("no text");
  });
});
