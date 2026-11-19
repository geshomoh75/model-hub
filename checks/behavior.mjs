// Behavior: every frozen feature's main path (F001–F005).
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { fakeGateway, REPLY_START } from "./fake-gateway.mjs";

const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ask = [{ role: "user", content: "Write a short welcome note for a new teammate." }];

async function pick(page, trigger, option) {
  await page.getByTestId(trigger).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const runtime = await startRuntime(fakeGateway);
try {
  // ---------- F001: catalogue as a member ----------
  const member = await (await runtime.context("member")).newPage();
  await member.goto("/");
  await expect(member.getByRole("heading", { level: 1, name: "Models" })).toBeVisible();
  await runtime.assertBackLink(member);
  await expect(member.getByTestId("model-row")).toHaveCount(5);
  await expect(member.getByTestId("model-row").first()).toContainText("$");
  await expect(member.getByTestId("add-model")).toHaveCount(0);
  await member.getByTestId("model-search").fill("llama");
  await expect(member.getByTestId("model-row")).toHaveCount(1);
  await expect(member.getByTestId("model-row")).toContainText("meta-llama/llama-3.3-70b-instruct");
  await expect(member.getByTestId("model-row")).toContainText("131,072");
  await member.getByTestId("model-search").fill("");
  await pick(member, "provider-filter", "OpenAI");
  await expect(member.getByTestId("model-row")).toHaveCount(2);
  await pick(member, "provider-filter", "All providers");
  await expect(member.getByTestId("model-row")).toHaveCount(5);
  await member.getByRole("button", { name: "Sort by Input price" }).click();
  await member.getByRole("button", { name: "Sort by Input price" }).click();
  await expect(member.getByTestId("model-row").first()).toContainText("openai/gpt-4.1");
  await member.getByTestId("model-row").filter({ hasText: "openai/gpt-4o-mini" }).getByRole("link").first().click();
  await expect(member.getByTestId("model-id")).toHaveText("openai/gpt-4o-mini");
  await expect(member.getByRole("button", { name: "Copy model ID" })).toBeVisible();
  await expect(member.getByText("Text, Image → Text")).toBeVisible();

  // ---------- F001: admin adds, edits, disables ----------
  const owner = await (await runtime.context("owner")).newPage();
  await owner.goto("/");
  await owner.getByTestId("add-model").click();
  await owner.getByLabel("Model ID").fill("openai/gpt-4-turbo");
  await owner.getByLabel("Name", { exact: true }).fill("GPT-4 Turbo");
  await pick(owner, "model-provider", "OpenAI");
  await owner.getByLabel("Upstream model").fill("retired-gpt-4-turbo");
  await owner.getByLabel("Context length").fill("128000");
  await owner.getByLabel("Input price", { exact: true }).fill("10");
  await owner.getByLabel("Output price", { exact: true }).fill("30");
  await owner.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByTestId("model-row").filter({ hasText: "openai/gpt-4-turbo" })).toContainText("$10.00");
  await owner.goto("/models/openai/gpt-4-turbo");
  await owner.getByRole("button", { name: "Edit" }).click();
  await owner.getByLabel("Output price", { exact: true }).fill("25");
  await owner.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByTestId("output-price")).toContainText("$25.00");
  await owner.goto("/models/google/gemini-2.0-flash");
  await owner.getByTestId("toggle-enabled").click();
  await expect(owner.getByText("Disabled", { exact: true })).toBeVisible();
  await member.goto("/");
  await expect(member.getByTestId("model-row")).toHaveCount(5);
  await expect(member.getByText("google/gemini-2.0-flash")).toHaveCount(0);

  // ---------- F002: the API ----------
  const models = await (await runtime.fetch("/api/v1/models", { role: "member" })).json();
  const ids = models.data.map((m) => m.id);
  expect(ids).toContain("openai/gpt-4o-mini");
  expect(ids).not.toContain("google/gemini-2.0-flash");
  expect(models.data.find((m) => m.id === "openai/gpt-4o-mini").context_length).toBe(128000);

  const ok = await runtime.fetch("/api/v1/chat/completions", { role: "member", ...json({ model: "openai/gpt-4o-mini", messages: ask, temperature: 0.2, max_tokens: 200 }) });
  expect(ok.status).toBe(200);
  const body = await ok.json();
  expect(body.object).toBe("chat.completion");
  expect(body.model).toBe("openai/gpt-4o-mini");
  expect(body.choices[0].message.content).toContain(REPLY_START);
  expect(body.usage.prompt_tokens).toBe(38);
  expect(body.usage.completion_tokens).toBe(41);

  const unknown = await runtime.fetch("/api/v1/chat/completions", { role: "member", ...json({ model: "nobody/nothing", messages: ask }) });
  expect(unknown.status).toBe(404);
  expect((await unknown.json()).error.message).toContain("nobody/nothing");
  const disabled = await runtime.fetch("/api/v1/chat/completions", { role: "member", ...json({ model: "google/gemini-2.0-flash", messages: ask }) });
  expect(disabled.status).toBe(404);
  const malformed = await runtime.fetch("/api/v1/chat/completions", { role: "member", method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
  expect(malformed.status).toBe(400);
  expect((await malformed.json()).error.type).toBe("invalid_request_error");
  const noMessages = await runtime.fetch("/api/v1/chat/completions", { role: "member", ...json({ model: "openai/gpt-4o-mini" }) });
  expect(noMessages.status).toBe(400);
  const upstream = await runtime.fetch("/api/v1/chat/completions", { role: "member", ...json({ model: "openai/gpt-4-turbo", messages: ask }) });
  expect(upstream.status).toBe(502);
  expect((await upstream.json()).error.message.length).toBeGreaterThan(0);
  const unconfigured = await runtime.fetch("/api/v1/chat/completions", { role: "member", ...json({ model: "mistralai/mistral-small", messages: ask }) });
  expect(unconfigured.status).toBe(503);
  expect((await unconfigured.json()).error.message).toContain("MISTRAL_API_KEY");

  const stream = await runtime.fetch("/api/v1/chat/completions", { role: "member", ...json({ model: "meta-llama/llama-3.3-70b-instruct", messages: ask, stream: true }) });
  expect(stream.status).toBe(200);
  expect(stream.headers.get("content-type")).toContain("text/event-stream");
  const sse = await stream.text();
  expect(sse).toContain('"model":"meta-llama/llama-3.3-70b-instruct"');
  expect(sse).toContain("aboard!");
  expect(sse.trim().endsWith("data: [DONE]")).toBe(true);

  // ---------- F003: fallbacks ----------
  const fell = await runtime.fetch("/api/v1/chat/completions", { role: "member", ...json({ models: ["openai/gpt-4-turbo", "openai/gpt-4o-mini"], messages: ask }) });
  expect(fell.status).toBe(200);
  expect((await fell.json()).model).toBe("openai/gpt-4o-mini");
  const fell2 = await runtime.fetch("/api/v1/chat/completions", { role: "member", ...json({ model: "mistralai/mistral-small", models: ["meta-llama/llama-3.3-70b-instruct"], messages: ask }) });
  expect(fell2.status).toBe(200);
  const fell2Body = await fell2.json();
  expect(fell2Body.model).toBe("meta-llama/llama-3.3-70b-instruct");
  // Priced by the model that answered: 38 × 0.59 + 41 × 0.79 per million.
  expect(fell2Body.usage.cost).toBeCloseTo((38 * 0.59 + 41 * 0.79) / 1e6, 10);
  const allFail = await runtime.fetch("/api/v1/chat/completions", { role: "member", ...json({ models: ["openai/gpt-4-turbo"], messages: ask }) });
  expect(allFail.status).toBe(502);

  // ---------- F004: playground ----------
  await member.goto("/chat");
  await expect(member.getByRole("heading", { level: 1, name: "Chat" })).toBeVisible();
  await member.getByRole("button", { name: "New conversation" }).click();
  await expect(member).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await pick(member, "chat-model", "Mistral Small");
  await pick(member, "add-fallback", "GPT-4o mini");
  await expect(member.getByTestId("fallback-item")).toHaveText(["GPT-4o mini"]);
  await member.getByLabel("System prompt").fill("You write warm, concise notes for a product team.");
  await member.getByLabel("System prompt").blur();
  await member.getByTestId("chat-input").fill("Draft a short welcome note for Priya, who joins the design team on Monday.");
  await member.getByRole("button", { name: "Send" }).click();
  const reply = member.getByTestId("message").filter({ hasText: REPLY_START });
  await expect(reply).toBeVisible();
  await expect(reply.getByTestId("message-meta")).toContainText("openai/gpt-4o-mini");
  await expect(reply.getByTestId("message-meta")).toContainText("79 tokens");
  await expect(reply.getByTestId("message-meta")).toContainText("$");
  const conversationUrl = member.url();

  await member.getByRole("button", { name: "Rename" }).click();
  await member.getByLabel("Title").fill("Welcome note for Priya");
  await member.getByRole("button", { name: "Save" }).click();
  await expect(member.getByRole("heading", { level: 1, name: "Welcome note for Priya" })).toBeVisible();

  await member.goto("/chat");
  await member.getByRole("button", { name: "New conversation" }).click();
  await expect(member).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await member.goto("/chat");
  await expect(member.getByTestId("conversation-row")).toHaveCount(2);
  await expect(member.getByTestId("conversation-row").first()).toContainText("New conversation");
  await expect(member.getByTestId("conversation-row").nth(1)).toContainText("Welcome note for Priya");
  await member.getByTestId("conversation-row").first().getByRole("link").click();
  await member.getByRole("button", { name: "Delete" }).click();
  await expect(member.getByRole("alertdialog")).toContainText("Delete this conversation?");
  await member.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(member).toHaveURL(/\/chat$/);
  await expect(member.getByTestId("conversation-row")).toHaveCount(1);

  // ---------- F005: activity ----------
  await member.goto("/activity");
  await expect(member.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  // API: ok, 502, 503, stream, fell (2), fell2 (2), allFail (1); chat (2): 11 attempts, 5 answered.
  await expect(member.getByTestId("stat-requests")).toContainText("11");
  await expect(member.getByTestId("stat-tokens")).toContainText("395");
  await expect(member.getByTestId("model-breakdown")).toContainText("openai/gpt-4o-mini");
  await expect(member.getByTestId("generation-row").first()).toContainText("chat");
  await member.goto("/activity?status=error");
  await expect(member.getByTestId("generation-row")).toHaveCount(6);
  for (const row of await member.getByTestId("generation-row").all()) await expect(row).toContainText("Error");
  await member.goto("/activity?status=error&model=openai%2Fgpt-4-turbo");
  await expect(member.getByTestId("generation-row")).toHaveCount(3);
  await expect(member.getByTestId("generation-row").first()).toContainText("$0.00");
  const href = await member.getByRole("link", { name: "Export CSV" }).getAttribute("href");
  expect(href).toContain("status=error");
  const csv = await (await runtime.fetch(href, { role: "member" })).text();
  const lines = csv.trim().split("\n");
  expect(lines[0]).toContain("model");
  expect(lines).toHaveLength(4);
  for (const line of lines.slice(1)) expect(line).toContain("openai/gpt-4-turbo");
  await member.goto("/activity?provider=groq");
  await expect(member.getByTestId("generation-row")).toHaveCount(2);

  // Admin sees everyone, filters by member.
  await owner.goto("/activity");
  await expect(owner.getByTestId("stat-requests")).toContainText("11");
  await owner.goto("/activity?member=owner");
  await expect(owner.getByTestId("generation-row")).toHaveCount(0);

  // ---------- F002: in-app API page ----------
  await member.goto("/api-access");
  const host = runtime.hostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(member.getByTestId("endpoint-url")).toHaveText(new RegExp(`^https?://${host}/api/v1/chat/completions$`));
  // The example names a model members can call.
  await expect(member.getByTestId("example-request")).toContainText(`"model": "${ids[0]}"`);
  await expect(member.getByTestId("example-request")).toContainText("/api/v1/chat/completions");

  // ---------- Phone smoke ----------
  const phone = await (await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto("/");
  await expect(phone.getByRole("heading", { level: 1, name: "Models" })).toBeVisible();
  await expect(phone.getByTestId("model-row").first()).toBeVisible();
  await phone.goto(conversationUrl);
  await expect(phone.getByTestId("chat-input")).toBeVisible();

  // Journey ends on the conversation with its reply.
  await member.goto(conversationUrl);
  await expect(member.getByTestId("message").filter({ hasText: REPLY_START })).toBeVisible();
  await expect(member.getByTestId("message").filter({ hasText: "Priya" })).toBeVisible();
  await runtime.screenshot(member);
} finally {
  await runtime.close();
}

// ---------- F001 empty catalogue ----------
const empty = await startRuntime({ setup: async ({ mf }) => { await (await mf.getD1Database("DB")).exec("DELETE FROM models"); } });
try {
  const owner = await (await empty.context("owner")).newPage();
  await owner.goto("/");
  await expect(owner.getByText("No models yet")).toBeVisible();
  await expect(owner.getByTestId("add-model")).toBeVisible();
  const list = await (await empty.fetch("/api/v1/models", { role: "member" })).json();
  expect(list.data).toEqual([]);
} finally {
  await empty.close();
}
console.log("behavior: ok");
