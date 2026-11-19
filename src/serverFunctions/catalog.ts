import { createServerFn } from "@tanstack/react-start";
import { isAdmin } from "@every-app/sdk/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import * as catalog from "@/server/catalog";
import { requireAdmin } from "@/serverFunctions/admin";

export const getCatalog = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) => {
    const admin = isAdmin(user);
    return { admin, models: await catalog.listModels({ includeDisabled: admin }) };
  });

export const getCatalogModel = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data, context: { user } }) => {
    const admin = isAdmin(user);
    return { admin, model: await catalog.getModel(data.id, { includeDisabled: admin }) };
  });

export const saveModel = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => catalog.modelInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    requireAdmin(user);
    try {
      return { ok: true as const, model: await catalog.saveModel(data) };
    } catch (error) {
      if (error instanceof catalog.CatalogError) return { ok: false as const, error: error.message };
      throw error;
    }
  });

export const setModelEnabled = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => catalog.setEnabledInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    requireAdmin(user);
    return catalog.setModelEnabled(data);
  });
