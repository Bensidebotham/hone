import { describe, it, expect, vi } from "vitest";
import { extractText } from "@/lib/resume/extract";

vi.mock("mammoth", () => ({ default: { extractRawText: vi.fn().mockResolvedValue({ value: "docx text" }) } }));
const mockGetText = vi.fn().mockResolvedValue({ text: "pdf text" });
vi.mock("pdf-parse", () => ({
  PDFParse: class {
    getText() { return mockGetText(); }
  },
}));

describe("extractText", () => {
  it("extracts from pdf", async () => {
    expect(await extractText(Buffer.from("x"), "application/pdf")).toBe("pdf text");
  });
  it("extracts from docx", async () => {
    const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect(await extractText(Buffer.from("x"), mime)).toBe("docx text");
  });
  it("rejects unsupported", async () => {
    await expect(extractText(Buffer.from("x"), "image/png")).rejects.toThrow(/unsupported/i);
  });
});
