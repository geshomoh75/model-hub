import { createFileRoute } from "@tanstack/react-router";
import { listModels } from "@/server/catalog";
import { callerOf, unauthorized } from "@/server/caller";

// GET /api/v1/models: the enabled catalogue, OpenAI-style.
export const Route = createFileRoute("/api/v1/models")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (!(await callerOf(request))) return unauthorized();
        const models = await listModels({ includeDisabled: false });
        return Response.json({
          object: "list",
          data: models.map((m) => ({
            id: m.id,
            object: "model",
            name: m.name,
            provider: m.provider,
            description: m.description,
            context_length: m.contextLength,
            modalities: { input: m.inputModalities.split(","), output: m.outputModalities.split(",") },
            pricing: { input_per_million: m.inputPrice, output_per_million: m.outputPrice, currency: "USD" },
            created: Math.floor(Date.parse(m.createdAt) / 1000),
          })),
        });
      },
    },
  },
});
