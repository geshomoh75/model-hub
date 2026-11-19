// The app's tools for AI clients. The Gateway serves them at /mcp and
// calls each with the signed-in user.
import { defineTools, isAdmin } from "@every-app/sdk/server";
import { z } from "zod";
import { listModels } from "@/server/catalog";

export const tools = defineTools({
  list_models: {
    description:
      "List the models in the organization's catalogue: id, name, provider, context length and USD prices per million input and output tokens.",
    risk: "read",
    input: z.object({}).strict(),
    handler: async (_input, { user }) => {
      const models = await listModels({ includeDisabled: isAdmin(user) });
      return models.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        contextLength: m.contextLength,
        inputPrice: m.inputPrice,
        outputPrice: m.outputPrice,
        enabled: m.enabled,
      }));
    },
  },
});
