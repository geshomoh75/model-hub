import { and, asc, desc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { listModels } from "@/server/catalog";
import { ApiError, complete } from "@/server/completions";

const id = z.string().uuid();
export const conversationIdInput = z.object({ id }).strict();
export const renameInput = z.object({ id, title: z.string().trim().min(1, "Title is required").max(120) }).strict();
export const settingsInput = z
  .object({
    id,
    modelId: z.string().min(1),
    fallbackModelIds: z.array(z.string().min(1)).max(5),
    systemPrompt: z.string().max(8000),
  })
  .strict();
export const sendInput = z.object({ id, content: z.string().trim().min(1, "Write a message").max(32000) }).strict();

const DEFAULT_TITLE = "New conversation";

/** Only the owner's: every query below filters by userId. */
function owned(userId: string, conversationId: string) {
  return and(eq(conversations.id, conversationId), eq(conversations.userId, userId));
}

export function listConversations(userId: string) {
  return db
    .select({ id: conversations.id, title: conversations.title, modelId: conversations.modelId, updatedAt: conversations.updatedAt })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt), desc(conversations.id));
}

export async function createConversation(userId: string) {
  const [first] = await listModels({ includeDisabled: false });
  if (!first) throw new Error("No models are enabled yet");
  const now = new Date().toISOString();
  const [row] = await db
    .insert(conversations)
    .values({ id: crypto.randomUUID(), userId, title: DEFAULT_TITLE, modelId: first.id, createdAt: now, updatedAt: now })
    .returning({ id: conversations.id });
  return row!;
}

export async function getConversation(userId: string, conversationId: string) {
  const [conversation] = await db.select().from(conversations).where(owned(userId, conversationId));
  if (!conversation) return null;
  const thread = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.seq));
  return {
    ...conversation,
    fallbackModelIds: JSON.parse(conversation.fallbackModelIds) as string[],
    messages: thread,
  };
}

export async function renameConversation(userId: string, input: z.infer<typeof renameInput>) {
  const [row] = await db
    .update(conversations)
    .set({ title: input.title })
    .where(owned(userId, input.id))
    .returning({ id: conversations.id });
  return row ?? null;
}

export async function updateSettings(userId: string, input: z.infer<typeof settingsInput>) {
  const fallbacks = input.fallbackModelIds.filter((m, i, all) => m !== input.modelId && all.indexOf(m) === i);
  const [row] = await db
    .update(conversations)
    .set({ modelId: input.modelId, fallbackModelIds: JSON.stringify(fallbacks), systemPrompt: input.systemPrompt })
    .where(owned(userId, input.id))
    .returning({ id: conversations.id });
  return row ?? null;
}

export async function deleteConversation(userId: string, conversationId: string) {
  const [row] = await db
    .delete(conversations)
    .where(owned(userId, conversationId))
    .returning({ id: conversations.id });
  if (row) await db.delete(messages).where(eq(messages.conversationId, conversationId));
  return row ?? null;
}

/** Sends the thread to the conversation's model (then its fallbacks) and saves both messages. */
export async function sendMessage(
  user: { id: string; email: string },
  input: z.infer<typeof sendInput>,
): Promise<{ ok: true } | { ok: false; error: string } | null> {
  const conversation = await getConversation(user.id, input.id);
  if (!conversation) return null;
  const history = conversation.messages.map((m) => ({ role: m.role, content: m.content }));
  const prompt = conversation.systemPrompt.trim();
  let answer;
  try {
    const result = await complete(user, "chat", {
      model: conversation.modelId,
      models: conversation.fallbackModelIds,
      messages: [
        ...(prompt ? [{ role: "system" as const, content: prompt }] : []),
        ...history,
        { role: "user" as const, content: input.content },
      ],
    });
    if (result.kind !== "json") throw new Error("Unexpected stream");
    answer = result.answer;
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message };
    throw error;
  }
  const choice = answer.body.choices[0] as { message?: { content?: unknown } } | undefined;
  const reply = typeof choice?.message?.content === "string" ? choice.message.content : "";
  const [last] = await db
    .select({ seq: max(messages.seq) })
    .from(messages)
    .where(eq(messages.conversationId, input.id));
  const seq = (last?.seq ?? 0) + 1;
  const now = new Date().toISOString();
  await db.batch([
    db.insert(messages).values({ id: crypto.randomUUID(), conversationId: input.id, role: "user", content: input.content, seq, createdAt: now }),
    db.insert(messages).values({
      id: crypto.randomUUID(),
      conversationId: input.id,
      role: "assistant",
      content: reply,
      modelId: answer.model.id,
      promptTokens: answer.body.usage.prompt_tokens,
      completionTokens: answer.body.usage.completion_tokens,
      cost: answer.body.usage.cost,
      seq: seq + 1,
      createdAt: now,
    }),
    db.update(conversations).set({ updatedAt: now }).where(owned(user.id, input.id)),
  ]);
  return { ok: true };
}
