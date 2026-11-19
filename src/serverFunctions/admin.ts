import { isAdmin, type EveryAppUser } from "@every-app/sdk/server";

/** Catalogue changes are for the organization's owners and admins. */
export function requireAdmin(user: EveryAppUser): void {
  if (!isAdmin(user)) throw new Error("Only admins can change the catalogue");
}
