import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { generations } from "@/db/schema";
import { csvField } from "@/lib/format";
import type { ActivityFilters } from "@/lib/activityFilters";
export { activityFilters } from "@/lib/activityFilters";

export const PAGE_SIZE = 25;
const RANGE_DAYS = 30;

/** The date range the filters name, else the last 30 days through today (UTC). */
export function rangeOf(filters: ActivityFilters): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  const to = filters.to ?? today;
  const from =
    filters.from ??
    new Date(Date.parse(`${to}T00:00:00Z`) - (RANGE_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  return from <= to ? { from, to } : { from: to, to: from };
}

/**
 * The rows a viewer may see: their own, or for an admin everyone's (or
 * one member's). A member's `member` filter is ignored.
 */
function where(viewer: { id: string; admin: boolean }, filters: ActivityFilters): SQL | undefined {
  const { from, to } = rangeOf(filters);
  const end = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString();
  const owner = viewer.admin ? filters.member : viewer.id;
  return and(
    gte(generations.createdAt, `${from}T00:00:00.000Z`),
    lt(generations.createdAt, end),
    owner ? eq(generations.userId, owner) : undefined,
    filters.model ? eq(generations.modelId, filters.model) : undefined,
    filters.provider ? eq(generations.provider, filters.provider) : undefined,
    filters.status ? eq(generations.status, filters.status) : undefined,
  );
}

const tokens = sql<number>`coalesce(sum(${generations.promptTokens} + ${generations.completionTokens}), 0)`;
const spend = sql<number>`coalesce(sum(${generations.cost}), 0)`;
const requests = sql<number>`count(*)`;

export async function activitySummary(viewer: { id: string; admin: boolean }, filters: ActivityFilters) {
  const condition = where(viewer, filters);
  const dayOf = sql<string>`substr(${generations.createdAt}, 1, 10)`;
  const [totals, daily, byModel, choices] = await db.batch([
    db.select({ spend, requests, tokens }).from(generations).where(condition),
    db.select({ day: dayOf, spend, requests, tokens }).from(generations).where(condition).groupBy(dayOf).orderBy(dayOf),
    db
      .select({ modelId: generations.modelId, provider: generations.provider, spend, requests, tokens })
      .from(generations)
      .where(condition)
      .groupBy(generations.modelId, generations.provider)
      .orderBy(desc(spend), desc(requests)),
    // What the filters can pick from: everything the viewer may see.
    db
      .selectDistinct({ modelId: generations.modelId, provider: generations.provider })
      .from(generations)
      .where(viewer.admin ? undefined : eq(generations.userId, viewer.id)),
  ]);
  const range = rangeOf(filters);
  // Every day of the range, zero where nothing ran.
  const series: { day: string; spend: number; requests: number; tokens: number }[] = [];
  for (let t = Date.parse(`${range.from}T00:00:00Z`); t <= Date.parse(`${range.to}T00:00:00Z`); t += 86_400_000) {
    const key = new Date(t).toISOString().slice(0, 10);
    const found = daily.find((d) => d.day === key);
    series.push({ day: key, spend: found?.spend ?? 0, requests: found?.requests ?? 0, tokens: found?.tokens ?? 0 });
  }
  return {
    range,
    totals: totals[0] ?? { spend: 0, requests: 0, tokens: 0 },
    series,
    byModel,
    modelIds: [...new Set(choices.map((c) => c.modelId))].sort(),
    providers: [...new Set(choices.map((c) => c.provider))].sort(),
  };
}

const listed = {
  id: generations.id,
  createdAt: generations.createdAt,
  userEmail: generations.userEmail,
  modelId: generations.modelId,
  provider: generations.provider,
  source: generations.source,
  attempt: generations.attempt,
  status: generations.status,
  error: generations.error,
  promptTokens: generations.promptTokens,
  completionTokens: generations.completionTokens,
  cost: generations.cost,
  latencyMs: generations.latencyMs,
};

export async function listGenerations(viewer: { id: string; admin: boolean }, filters: ActivityFilters) {
  const page = filters.page ?? 1;
  const condition = where(viewer, filters);
  const [rows, [count]] = await db.batch([
    db
      .select(listed)
      .from(generations)
      .where(condition)
      .orderBy(desc(generations.createdAt), desc(generations.attempt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: requests }).from(generations).where(condition),
  ]);
  return { rows, total: count?.total ?? 0, page, pageSize: PAGE_SIZE };
}

const CSV_LIMIT = 100_000;

/** Exactly the filtered rows, as CSV. */
export async function generationsCsv(viewer: { id: string; admin: boolean }, filters: ActivityFilters) {
  const rows = await db
    .select(listed)
    .from(generations)
    .where(where(viewer, filters))
    .orderBy(desc(generations.createdAt), desc(generations.attempt))
    .limit(CSV_LIMIT);
  const header = ["time", "member", "model", "provider", "source", "status", "attempt", "prompt_tokens", "completion_tokens", "cost_usd", "latency_ms", "error"];
  const lines = rows.map((r) =>
    [r.createdAt, r.userEmail, r.modelId, r.provider, r.source, r.status, r.attempt, r.promptTokens, r.completionTokens, r.cost.toFixed(8), r.latencyMs, r.error]
      .map(csvField)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}
