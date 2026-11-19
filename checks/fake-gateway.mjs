// A local stand-in for the Gateway's AI proxy, so suites can exercise
// successful, failing and unconfigured providers without any real key.
// - Upstream model names starting with "retired-" answer 500.
// - The mistral provider answers as a Gateway with no key set.
// - Everything else answers with a fixed reply and usage.
const SCRIPT = `
const REPLY = "Welcome aboard! We're glad to have you on the design team. Your first week is about meeting people, so book a coffee with anyone whose work you admire.";
export default { async fetch(request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\\/api\\/ai\\/([^/]+)\\/.*chat\\/completions$/);
  if (!match || request.method !== "POST") {
    const code = "integration_not_configured";
    return Response.json({ error: "Service Unavailable", code, message: "Not configured here." }, { status: 503, headers: { "x-everyapp-error": code } });
  }
  const provider = match[1];
  const body = await request.json();
  if (provider === "mistral") {
    const code = "ai_provider_not_configured";
    return Response.json({ error: "Service Unavailable", code, message: "No Mistral AI key is set.", setup: "Set MISTRAL_API_KEY on the Gateway.", command: "everyapp provider add mistral" }, { status: 503, headers: { "x-everyapp-error": code } });
  }
  if (String(body.model).startsWith("retired-")) {
    return Response.json({ error: { message: "The model is not available.", type: "server_error" } }, { status: 500 });
  }
  const usage = { prompt_tokens: 38, completion_tokens: 41, total_tokens: 79 };
  if (body.stream) {
    const enc = new TextEncoder();
    const words = REPLY.split(" ");
    const chunks = words.map((w, i) => ({ id: "up-1", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta: { content: (i ? " " : "") + w }, finish_reason: null }] }));
    chunks.push({ id: "up-1", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
    chunks.push({ id: "up-1", object: "chat.completion.chunk", created: 1, model: body.model, choices: [], usage });
    const text = chunks.map((c) => "data: " + JSON.stringify(c) + "\\n\\n").join("") + "data: [DONE]\\n\\n";
    return new Response(enc.encode(text), { headers: { "content-type": "text/event-stream" } });
  }
  return Response.json({ id: "up-1", object: "chat.completion", created: 1, model: body.model,
    choices: [{ index: 0, message: { role: "assistant", content: REPLY }, finish_reason: "stop" }], usage });
} };`;

export const REPLY_START = "Welcome aboard!";

export const fakeGateway = {
  workers: [{ config: { name: "fake-ai-gateway", compatibilityDate: "2025-01-01",
    manifest: { mainModule: "fake.mjs", modules: { "fake.mjs": { type: "esm", contents: SCRIPT } } } } }],
  bindings: { EVERY_APP_GATEWAY: { type: "worker", worker: "fake-ai-gateway" } },
};
