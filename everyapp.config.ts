import { defineEveryApp } from "@every-app/sdk";

const docs = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  gemini: "https://aistudio.google.com/apikey",
  groq: "https://console.groq.com/keys",
  mistral: "https://console.mistral.ai/api-keys",
  "workers-ai": "https://dash.cloudflare.com/profile/api-tokens",
} as const;

export default defineEveryApp({
  id: "model-hub",
  name: "Model Hub",
  description:
    "One OpenAI-compatible API, a chat playground and a usage log for the AI models your team picks.",
  resources: {
    d1: ["DB"],
  },
  providers: [
    { id: "openai", why: "Answers for catalogue models mapped to OpenAI.", docs: docs.openai },
    { id: "anthropic", why: "Answers for catalogue models mapped to Anthropic.", docs: docs.anthropic },
    { id: "gemini", why: "Answers for catalogue models mapped to Google Gemini.", docs: docs.gemini },
    { id: "groq", why: "Answers for catalogue models mapped to Groq.", docs: docs.groq },
    { id: "mistral", why: "Answers for catalogue models mapped to Mistral AI.", docs: docs.mistral },
    { id: "workers-ai", why: "Answers for catalogue models mapped to Workers AI.", docs: docs["workers-ai"] },
  ],
  features: {
    openai: { name: "OpenAI", why: "Routes requests to OpenAI models.", providers: ["openai"] },
    anthropic: { name: "Anthropic", why: "Routes requests to Anthropic models.", providers: ["anthropic"] },
    gemini: { name: "Google Gemini", why: "Routes requests to Gemini models.", providers: ["gemini"] },
    groq: { name: "Groq", why: "Routes requests to models hosted on Groq.", providers: ["groq"] },
    mistral: { name: "Mistral AI", why: "Routes requests to Mistral models.", providers: ["mistral"] },
    "workers-ai": { name: "Workers AI", why: "Routes requests to models on Cloudflare Workers AI.", providers: ["workers-ai"] },
  },
});
