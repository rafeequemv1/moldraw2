import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ZodType } from 'zod';
import { resolveGeminiModelId } from './providers/geminiModels';

export interface GenerateStructuredJsonOptions<T> {
  apiKey: string;
  model?: string;
  system: string;
  user: string;
  schema: ZodType<T>;
}

/**
 * One-shot Gemini call returning JSON parsed and validated with Zod.
 * Used by plugin services.ai and other structured prediction paths.
 */
export async function generateStructuredJson<T>(
  opts: GenerateStructuredJsonOptions<T>,
): Promise<T> {
  const genAI = new GoogleGenerativeAI(opts.apiKey);
  const modelId = resolveGeminiModelId(opts.model);
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: opts.system,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const result = await model.generateContent(opts.user);
  const text = result.response.text();
  if (!text?.trim()) {
    throw new Error('AI returned an empty response.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('AI response was not valid JSON.');
  }

  const validated = opts.schema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`AI response failed validation: ${validated.error.message}`);
  }
  return validated.data;
}
