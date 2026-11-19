// Authorization: private paths, member isolation, admin-only catalogue
// changes, and no sign-in of the app's own (X001).
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { fakeGateway } from "./fake-gateway.mjs";

const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ask = [{ role: "user", content: "Hello" }];

/** Runs `trigger` and returns the server-function request it sends. */
async function captureServerFn(page, trigger) {
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && r.url().includes("/_serverFn/")),
    trigger(),
  ]);
  const url = new URL(request.url());
  const headers = Object.fromEntries(Object.entries(await request.allHeaders()).filter(([name]) =>
    name === "content-type" || name === "accept" || name.startsWith("x-tsr")));
  return { path: url.pathname + url.search, headers, body: request.postData() };
}
const replay = (runtime, captured, role) =>
  runtime.fetch(captured.path, { role, method: "POST", headers: captured.headers, body: captured.body });

const runtime = await startRuntime(fakeGateway);
try {
  await runtime.assertPrivateAccess(["/", "/chat", "/activity", "/api-access", "/models/openai/gpt-4o-mini", "/api/v1/models", "/api/activity.csv"]);

  for (const role of [undefined, "outsider"]) {
    const call = await runtime.fetch("/api/v1/chat/completions", { role, ...json({ model: "openai/gpt-4o-mini", messages: ask }) });
    expect([401, 403]).toContain(call.status);
    const models = await runtime.fetch("/api/v1/models", { role });
    expect([401, 403]).toContain(models.status);
  }

  // No sign-in of the app's own.
  for (const path of ["/login", "/signin", "/sign-in", "/signup", "/logout"]) {
    const res = await runtime.fetch(path, { role: "member" });
    expect(res.status).toBe(404);
  }
  const memberPage = await (await runtime.context("member")).newPage();
  await memberPage.goto("/");
  await expect(memberPage.getByRole("heading", { level: 1, name: "Models" })).toBeVisible();
  await expect(memberPage.locator('input[type="password"]')).toHaveCount(0);

  // Admin-only: catalogue changes.
  await expect(memberPage.getByTestId("add-model")).toHaveCount(0);
  await memberPage.goto("/models/openai/gpt-4o-mini");
  await expect(memberPage.getByTestId("model-id")).toHaveText("openai/gpt-4o-mini");
  await expect(memberPage.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(memberPage.getByTestId("toggle-enabled")).toHaveCount(0);

  const ownerPage = await (await runtime.context("owner")).newPage();
  await ownerPage.goto("/models/openai/gpt-4o-mini");
  const disable = await captureServerFn(ownerPage, () => ownerPage.getByTestId("toggle-enabled").click());
  await expect(ownerPage.getByText("Disabled", { exact: true })).toBeVisible();
  await ownerPage.getByTestId("toggle-enabled").click();
  await expect(ownerPage.getByText("Disabled", { exact: true })).toHaveCount(0);
  const refused = await replay(runtime, disable, "member");
  // Server functions answer 200 with the thrown error serialized.
  expect(await refused.text()).toContain("Only admins can change the catalogue");
  const db = await runtime.database();
  const row = await db.prepare("SELECT enabled FROM models WHERE id = ?").bind("openai/gpt-4o-mini").first();
  expect(row.enabled).toBe(1);

  await ownerPage.getByRole("button", { name: "Edit" }).click();
  await ownerPage.getByLabel("Input price", { exact: true }).fill("0.2");
  const edit = await captureServerFn(ownerPage, () => ownerPage.getByRole("button", { name: "Save" }).click());
  await expect(ownerPage.getByTestId("input-price")).toContainText("$0.20");
  const editAsMember = await replay(runtime, { ...edit, body: edit.body.replace("0.2", "0.01") }, "member");
  expect(await editAsMember.text()).toContain("Only admins can change the catalogue");
  const price = await db.prepare("SELECT input_price FROM models WHERE id = ?").bind("openai/gpt-4o-mini").first();
  expect(price.input_price).toBeCloseTo(0.2, 6);

  // Disabled models are hidden from members, also by direct address.
  await ownerPage.goto("/models/mistralai/mistral-small");
  await ownerPage.getByTestId("toggle-enabled").click();
  await expect(ownerPage.getByText("Disabled", { exact: true })).toBeVisible();
  await memberPage.goto("/models/mistralai/mistral-small");
  await expect(memberPage.getByText("Model not found")).toBeVisible();

  // Conversations are private to their creator, admins included.
  await memberPage.goto("/chat");
  await memberPage.getByRole("button", { name: "New conversation" }).click();
  await expect(memberPage).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  const conversationPath = new URL(memberPage.url()).pathname;
  const conversationId = conversationPath.split("/").pop();
  await memberPage.getByTestId("chat-input").fill("Plan a team offsite agenda.");
  await memberPage.getByRole("button", { name: "Send" }).click();
  await expect(memberPage.getByTestId("message")).toHaveCount(2);
  await memberPage.getByRole("button", { name: "Rename" }).click();
  await memberPage.getByLabel("Title").fill("Offsite agenda");
  const rename = await captureServerFn(memberPage, () => memberPage.getByRole("button", { name: "Save" }).click());
  await expect(memberPage.getByRole("heading", { level: 1, name: "Offsite agenda" })).toBeVisible();
  await memberPage.getByRole("button", { name: "Delete" }).click();
  const remove = await captureServerFn(memberPage, () => memberPage.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click());
  await expect(memberPage).toHaveURL(/\/chat$/);

  // A second conversation the owner will try to reach.
  await memberPage.getByRole("button", { name: "New conversation" }).click();
  await expect(memberPage).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  const secondId = new URL(memberPage.url()).pathname.split("/").pop();
  await memberPage.getByRole("button", { name: "Rename" }).click();
  await memberPage.getByLabel("Title").fill("Quarterly review notes");
  await memberPage.getByRole("button", { name: "Save" }).click();
  await expect(memberPage.getByRole("heading", { level: 1, name: "Quarterly review notes" })).toBeVisible();

  await ownerPage.goto(`/chat/${secondId}`);
  await expect(ownerPage.getByText("Conversation not found")).toBeVisible();
  await expect(ownerPage.getByText("Quarterly review notes")).toHaveCount(0);
  await ownerPage.goto("/chat");
  await expect(ownerPage.getByText("Quarterly review notes")).toHaveCount(0);

  const renameAsOwner = await replay(runtime, { ...rename, body: rename.body.replaceAll(conversationId, secondId).replace("Offsite agenda", "Taken over") }, "owner");
  expect(renameAsOwner.status).toBeLessThan(600);
  const deleteAsOwner = await replay(runtime, { ...remove, body: remove.body.replaceAll(conversationId, secondId) }, "owner");
  expect(deleteAsOwner.status).toBeLessThan(600);
  const second = await db.prepare("SELECT title FROM conversations WHERE id = ?").bind(secondId).first();
  expect(second?.title).toBe("Quarterly review notes");

  // Usage: members see their own; admins see everyone's.
  const ownerCall = await runtime.fetch("/api/v1/chat/completions", { role: "owner", ...json({ model: "meta-llama/llama-3.3-70b-instruct", messages: ask }) });
  expect(ownerCall.status).toBe(200);
  const memberCsv = await (await runtime.fetch("/api/activity.csv", { role: "member" })).text();
  expect(memberCsv).not.toContain("owner@example.test");
  expect(memberCsv).toContain("member@example.test");
  const memberAsks = await (await runtime.fetch("/api/activity.csv?member=owner", { role: "member" })).text();
  expect(memberAsks).not.toContain("owner@example.test");
  const ownerCsv = await (await runtime.fetch("/api/activity.csv", { role: "owner" })).text();
  expect(ownerCsv).toContain("owner@example.test");
  expect(ownerCsv).toContain("member@example.test");
  await memberPage.goto("/activity");
  await expect(memberPage.getByTestId("generation-row").filter({ hasText: "owner@example.test" })).toHaveCount(0);
  await expect(memberPage.getByTestId("member-filter")).toHaveCount(0);
  await ownerPage.goto("/activity");
  await expect(ownerPage.getByTestId("member-filter")).toBeVisible();
  await expect(ownerPage.getByTestId("generation-row").filter({ hasText: "owner@example.test" })).toHaveCount(1);

  // A member's CSV of a forged member filter, and the outsider, see nothing.
  const outsiderCsv = await runtime.fetch("/api/activity.csv", { role: "outsider" });
  expect([401, 403]).toContain(outsiderCsv.status);
} finally {
  await runtime.close();
}
console.log("authorization: ok");
