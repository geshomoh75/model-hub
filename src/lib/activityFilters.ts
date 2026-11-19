import { z } from "zod";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const activityFilters = z.object({
  from: day.optional(),
  to: day.optional(),
  model: z.string().max(200).optional(),
  provider: z.string().max(40).optional(),
  status: z.enum(["success", "error"]).optional(),
  member: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
});
export type ActivityFilters = z.infer<typeof activityFilters>;

