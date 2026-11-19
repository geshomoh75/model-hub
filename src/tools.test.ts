import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { callTool, listTools } from "@every-app/sdk/testing";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

// The tools called the way the Gateway calls them for an AI client: each
// with an identity minted for the one call, through the SDK's tools
// endpoint, which checks the caller's scopes and the input. The same
// in-memory SQLite with the app's migrations stands in for D1.
const testDb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return testDb.current;
  },
}));

const { tools } = await import("./tools");

beforeAll(async () => {
  const db = drizzle(createClient({ url: ":memory:" }), { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  testDb.current = db;
});

describe("tools", () => {
  it("lists each tool with its risk", async () => {
    const { tools: listed } = await listTools(tools);
    expect(listed.map(({ name, risk }) => [name, risk])).toEqual([["list_models", "read"]]);
  });

  it("lists the enabled catalogue to members", async () => {
    const result = await callTool(tools, "list_models", {}, { user: { orgRole: "member" } });
    expect(JSON.stringify(result)).toContain("openai/gpt-4o-mini");
  });
});
