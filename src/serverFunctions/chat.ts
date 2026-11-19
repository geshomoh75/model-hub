import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { listModels } from "@/server/catalog";
import * as chats from "@/server/conversations";

export const getConversations = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(({ context: { user } }) => chats.listConversations(user.id));

export const createConversation = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .handler(({ context: { user } }) => chats.createConversation(user.id));

export const getConversation = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => chats.conversationIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    const [conversation, models] = await Promise.all([
      chats.getConversation(user.id, data.id),
      listModels({ includeDisabled: false }),
    ]);
    if (!conversation) throw notFound();
    return {
      conversation,
      models: models.map((m) => ({ id: m.id, name: m.name })),
    };
  });

export const renameConversation = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => chats.renameInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    if (!(await chats.renameConversation(user.id, data))) throw notFound();
    return { ok: true };
  });

export const updateConversationSettings = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => chats.settingsInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    if (!(await chats.updateSettings(user.id, data))) throw notFound();
    return { ok: true };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => chats.conversationIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    if (!(await chats.deleteConversation(user.id, data.id))) throw notFound();
    return { ok: true };
  });

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => chats.sendInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    const result = await chats.sendMessage(user, data);
    if (!result) throw notFound();
    return result;
  });
