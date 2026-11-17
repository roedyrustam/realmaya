import type { z } from 'zod';
import type { LlmProvider } from '../types.js';

export interface OpenAiCompatibleConfig {
  /** Base URL (e.g. `https://api.openai.com/v1`, `http://localhost:11434/v1`, or Gemini OpenAI endpoint). */
  baseUrl: string;
  apiKey?: string;
  model: string;
}

/**
 * Creates a zero-dependency, provider-agnostic LLM adapter compatible with
 * OpenAI, Gemini OpenAI-compat, Groq, OpenRouter, and local Ollama/vLLM servers.
 */
export function createOpenAiCompatibleProvider(config: OpenAiCompatibleConfig): LlmProvider {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  return {
    name: `openai-compat:${config.model}`,
    async completeJson<T>({
      system,
      prompt,
      schema,
    }: {
      system: string;
      prompt: string;
      schema: z.ZodType<T>;
    }): Promise<T> {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `${system}\nRespond ONLY with a valid JSON object matching the requested structure.`,
            },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`LLM provider HTTP ${res.status}: ${body}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawContent = data.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new Error('LLM provider returned an empty response');
      }

      const parsedJson = extractJsonObject(rawContent);
      return schema.parse(parsedJson);
    },
  };
}

/** Extracts a JSON object from raw model output, stripping optional markdown fences. */
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  return JSON.parse(candidate);
}
