import { env } from "cloudflare:workers";
import { getEveryAppUser, type EveryAppUser } from "@every-app/sdk/server";
import { rememberUser } from "@/server/users";

/** The member behind a server route's request (a session or a personal access token). */
export async function callerOf(request: Request): Promise<EveryAppUser | null> {
  const user = await getEveryAppUser(request, env);
  if (user) await rememberUser(user);
  return user;
}

export function unauthorized(): Response {
  return Response.json(
    { error: { message: "Sign in through the Gateway or send a personal access token.", type: "authentication_error", code: "unauthorized", param: null } },
    { status: 401 },
  );
}
