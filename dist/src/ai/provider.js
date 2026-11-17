/**
 * Creates a zero-dependency, provider-agnostic LLM adapter compatible with
 * OpenAI, Gemini OpenAI-compat, Groq, OpenRouter, and local Ollama/vLLM servers.
 */
export function createOpenAiCompatibleProvider(config) {
    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    return {
        name: `openai-compat:${config.model}`,
        async completeJson({ system, prompt, schema, }) {
            const headers = {
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
            const data = (await res.json());
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
export function extractJsonObject(raw) {
    const trimmed = raw.trim();
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
    const candidate = fenced?.[1] ?? trimmed;
    return JSON.parse(candidate);
}
//# sourceMappingURL=provider.js.map