import { GoogleGenAI } from "@google/genai";

export interface AnalyzeInput { system: string; prompt: string; }

// ModelLike matches the shape of `ai.models` from @google/genai:
// generateContent returns a GenerateContentResponse whose `.text` getter is `string | undefined`.
export interface ModelLike {
  generateContent: (req: {
    model: string;
    contents: string;
    config: { responseMimeType: string };
  }) => Promise<{ text: string | undefined }>;
}

interface AnalyzeOpts { client?: ModelLike; }

function defaultClient(): ModelLike {
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY! });
  // ai.models satisfies ModelLike — generateContent is defined on the Models class
  return ai.models as unknown as ModelLike;
}

export async function analyze<T = unknown>(input: AnalyzeInput, opts: AnalyzeOpts = {}): Promise<T> {
  const client = opts.client ?? defaultClient();
  const res = await client.generateContent({
    model: "gemini-2.5-flash",
    contents: `${input.system}\n\n${input.prompt}`,
    config: { responseMimeType: "application/json" },
  });
  const text = res.text;
  if (text === undefined) {
    throw new Error("analyze: model returned no text (response.text is undefined)");
  }
  return JSON.parse(text) as T;
}
