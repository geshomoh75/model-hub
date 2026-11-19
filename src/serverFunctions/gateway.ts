import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ConfigurationError, gatewayUrl } from "@every-app/sdk/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { rememberUser } from "@/server/users";

/**
 * The Gateway's origin (in `everyapp dev`, the local launcher's): the way
 * back to the other apps, and the host the light/dark cookie is set on so
 * the launcher and every app share the pick. Null when the Worker has no
 * GATEWAY_URL; the pick then stays in this app's localStorage. Also records
 * the person on first sight, so admins can filter activity by member.
 */
export const getGatewayUrl = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) => {
    await rememberUser(user);
    try {
      return { gatewayUrl: new URL(gatewayUrl(env)).origin };
    } catch (error) {
      if (!(error instanceof ConfigurationError)) throw error;
      return { gatewayUrl: null };
    }
  });

/** The app's own origin, from the request, for the API page. */
export const getAppOrigin = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(() => {
    return { origin: new URL(getRequest().url).origin };
  });
