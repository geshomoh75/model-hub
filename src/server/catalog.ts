import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { models } from "@/db/schema";
import { PROVIDER_IDS } from "@/lib/providers";

export type Model = typeof models.$inferSelect;

const modalities = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]+(\s*,\s*[a-z]+)*$/, "List modalities separated by commas, such as text,image")
  .transform((list) => list.split(",").map((word) => word.trim()).join(","));

export const modelInput = z
  .object({
    // Set when editing: the entry being changed.
    originalId: z.string().optional(),
    id: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/, "Use vendor/name, such as acme/fast-1"),
    name: z.string().trim().min(1, "Name is required").max(120),
    provider: z.enum(PROVIDER_IDS),
    upstreamModel: z.string().trim().min(1, "Upstream model is required").max(200),
    inputModalities: modalities,
    outputModalities: modalities,
    contextLength: z.number().int().positive().max(100_000_000),
    inputPrice: z.number().min(0).max(100_000),
    outputPrice: z.number().min(0).max(100_000),
    description: z.string().trim().max(2000),
  })
  .strict();

export const setEnabledInput = z.object({ id: z.string(), enabled: z.boolean() }).strict();

/** The catalogue; disabled entries only for admins. */
export function listModels({ includeDisabled }: { includeDisabled: boolean }): Promise<Model[]> {
  return db
    .select()
    .from(models)
    .where(includeDisabled ? undefined : eq(models.enabled, true))
    .orderBy(asc(models.id));
}

export async function getModel(id: string, { includeDisabled }: { includeDisabled: boolean }) {
  const [row] = await db
    .select()
    .from(models)
    .where(and(eq(models.id, id), includeDisabled ? undefined : eq(models.enabled, true)));
  return row ?? null;
}

export function enabledModelsById(ids: string[]) {
  if (ids.length === 0) return Promise.resolve([] as Model[]);
  return db
    .select()
    .from(models)
    .where(and(inArray(models.id, ids), eq(models.enabled, true)));
}

export class CatalogError extends Error {}

/** Adds an entry, or changes one (its id included) when `originalId` is given. */
export async function saveModel(input: z.infer<typeof modelInput>): Promise<Model> {
  const now = new Date().toISOString();
  const { originalId, ...fields } = input;
  if (originalId !== input.id) {
    const taken = await getModel(input.id, { includeDisabled: true });
    if (taken) throw new CatalogError(`${input.id} is already in the catalogue`);
  }
  if (originalId) {
    const [row] = await db
      .update(models)
      .set({ ...fields, updatedAt: now })
      .where(eq(models.id, originalId))
      .returning();
    if (!row) throw new CatalogError("Model not found");
    return row;
  }
  const [row] = await db
    .insert(models)
    .values({ ...fields, enabled: true, createdAt: now, updatedAt: now })
    .returning();
  return row!;
}

export async function setModelEnabled({ id, enabled }: z.infer<typeof setEnabledInput>) {
  const [row] = await db
    .update(models)
    .set({ enabled, updatedAt: new Date().toISOString() })
    .where(eq(models.id, id))
    .returning();
  if (!row) throw new CatalogError("Model not found");
  return row;
}
