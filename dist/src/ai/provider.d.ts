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
export declare function createOpenAiCompatibleProvider(config: OpenAiCompatibleConfig): LlmProvider;
/** Extracts a JSON object from raw model output, stripping optional markdown fences. */
export declare function extractJsonObject(raw: string): unknown;
//# sourceMappingURL=provider.d.ts.map