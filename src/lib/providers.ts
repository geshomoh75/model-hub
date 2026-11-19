/** The AI providers a catalogue entry may map to, as the Gateway names them. */
export const PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "gemini", label: "Google Gemini" },
  { id: "groq", label: "Groq" },
  { id: "mistral", label: "Mistral AI" },
  { id: "workers-ai", label: "Workers AI" },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id) as [ProviderId, ...ProviderId[]];

export function providerLabel(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.label ?? id;
}
