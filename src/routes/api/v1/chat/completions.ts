import { createFileRoute } from "@tanstack/react-router";
import { callerOf, unauthorized } from "@/server/caller";
import { ApiError, apiErrorResponse, complete, completionRequest } from "@/server/completions";

// POST /api/v1/chat/completions: OpenAI-compatible, with ordered fallbacks in `models`.
export const Route = createFileRoute("/api/v1/chat/completions")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const user = await callerOf(request);
        if (!user) return unauthorized();
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return apiErrorResponse(new ApiError(400, "invalid_request_error", "invalid_json", "The body must be JSON."));
        }
        const parsed = completionRequest.safeParse(raw);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const where = issue?.path.join(".") || "body";
          return apiErrorResponse(new ApiError(400, "invalid_request_error", "invalid_request", `${where}: ${issue?.message ?? "invalid"}`));
        }
        try {
          const result = await complete(user, "api", parsed.data);
          return result.kind === "stream" ? result.response : Response.json(result.answer.body);
        } catch (error) {
          if (error instanceof ApiError) return apiErrorResponse(error);
          throw error;
        }
      },
    },
  },
});
