import { GoogleGenerativeAI } from "@google/generative-ai";

export interface AnalyzeInput { system: string; prompt: string; }
interface ModelLike { generateContent: (req: any) => Promise<{ response: { text: () => string } }>; }
interface AnalyzeOpts { client?: ModelLike; }

function defaultClient(): ModelLike {
  const genai = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
  return genai.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });
}

export async function analyze<T = unknown>(input: AnalyzeInput, opts: AnalyzeOpts = {}): Promise<T> {
  const client = opts.client ?? defaultClient();
  const res = await client.generateContent({
    contents: [{ role: "user", parts: [{ text: `${input.system}\n\n${input.prompt}` }] }],
  });
  return JSON.parse(res.response.text()) as T;
}
