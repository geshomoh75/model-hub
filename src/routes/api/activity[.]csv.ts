import { createFileRoute } from "@tanstack/react-router";
import { isAdmin } from "@every-app/sdk/server";
import { activityFilters, generationsCsv } from "@/server/activity";
import { callerOf, unauthorized } from "@/server/caller";

// GET /api/activity.csv: the activity page's filtered rows as a download.
export const Route = createFileRoute("/api/activity.csv")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const user = await callerOf(request);
        if (!user) return unauthorized();
        const params = Object.fromEntries(
          [...new URL(request.url).searchParams].filter(([, value]) => value !== ""),
        );
        const filters = activityFilters.safeParse(params);
        if (!filters.success) return new Response("Invalid filters", { status: 400 });
        const csv = await generationsCsv({ id: user.id, admin: isAdmin(user) }, filters.data);
        return new Response(csv, {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": 'attachment; filename="activity.csv"',
          },
        });
      },
    },
  },
});
