// Persistence: catalogue edits, conversations and generations survive a restart.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { fakeGateway, REPLY_START } from "./fake-gateway.mjs";

const runtime = await startRuntime(fakeGateway);
try {
  const owner = await (await runtime.context("owner")).newPage();
  await owner.goto("/models/openai/gpt-4.1");
  await owner.getByRole("button", { name: "Edit" }).click();
  await owner.getByLabel("Description").fill("Long-context model for code review and planning.");
  await owner.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByText("Long-context model for code review and planning.")).toBeVisible();

  const member = await (await runtime.context("member")).newPage();
  await member.goto("/chat");
  await member.getByRole("button", { name: "New conversation" }).click();
  await expect(member).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  const path = new URL(member.url()).pathname;
  await member.getByTestId("chat-input").fill("Summarise our release checklist.");
  await member.getByRole("button", { name: "Send" }).click();
  await expect(member.getByTestId("message").filter({ hasText: REPLY_START })).toBeVisible();

  const api = await runtime.fetch("/api/v1/chat/completions", { role: "member", method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "Hi" }] }) });
  expect(api.status).toBe(200);

  await runtime.restart();

  const owner2 = await (await runtime.context("owner")).newPage();
  await owner2.goto("/models/openai/gpt-4.1");
  await expect(owner2.getByText("Long-context model for code review and planning.")).toBeVisible();
  const member2 = await (await runtime.context("member")).newPage();
  await member2.goto(path);
  await expect(member2.getByTestId("message").filter({ hasText: "Summarise our release checklist." })).toBeVisible();
  await expect(member2.getByTestId("message").filter({ hasText: REPLY_START })).toBeVisible();
  const csv = await (await runtime.fetch("/api/activity.csv", { role: "member" })).text();
  const rows = csv.trim().split("\n").slice(1);
  expect(rows.filter((r) => r.includes(",chat,")).length).toBe(1);
  expect(rows.filter((r) => r.includes(",api,")).length).toBe(1);
} finally {
  await runtime.close();
}
console.log("persistence: ok");
