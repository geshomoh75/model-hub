import { createServerFn } from "@tanstack/react-start";
import { isAdmin } from "@every-app/sdk/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import * as activity from "@/server/activity";
import { listUsers } from "@/server/users";

export const getActivity = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => activity.activityFilters.parse(data))
  .handler(async ({ data, context: { user } }) => {
    const viewer = { id: user.id, admin: isAdmin(user) };
    const [summary, list, members] = await Promise.all([
      activity.activitySummary(viewer, data),
      activity.listGenerations(viewer, data),
      viewer.admin ? listUsers() : Promise.resolve(null),
    ]);
    return { admin: viewer.admin, summary, list, members };
  });
