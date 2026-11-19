import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/** Records a person the first time they're seen, keeping their email current. */
export async function rememberUser(user: { id: string; email: string }) {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email, createdAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
}

export function listUsers() {
  return db.select({ id: users.id, email: users.email }).from(users).orderBy(asc(users.email));
}
