import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function extractText(buf: Buffer, mime: string): Promise<string> {
  if (mime === "application/pdf") {
    const parser = new PDFParse({});
    return (await parser.getText()).text.trim();
  }
  if (mime === DOCX) return (await mammoth.extractRawText({ buffer: buf })).value.trim();
  if (mime === "text/plain") return buf.toString("utf8").trim();
  throw new Error(`Unsupported file type: ${mime}`);
}
