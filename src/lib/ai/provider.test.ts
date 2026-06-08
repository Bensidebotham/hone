import { describe, it, expect, vi } from "vitest";
import { analyze } from "@/lib/ai/provider";

describe("analyze", () => {
  it("returns parsed JSON from the model", async () => {
    const fakeModel = {
      generateContent: vi.fn().mockResolvedValue({
        response: { text: () => '{"score":80,"suggestions":["x"]}' },
      }),
    };
    const out = await analyze(
      { system: "s", prompt: "p" },
      { client: fakeModel as any }
    );
    expect(out).toEqual({ score: 80, suggestions: ["x"] });
  });
});
