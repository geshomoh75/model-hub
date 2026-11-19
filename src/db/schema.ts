import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Everyone who has used the app, keyed by the Gateway's user id. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: text("created_at").notNull(),
});

/** The organization's model catalogue. `id` is the public `vendor/name`. */
export const models = sqliteTable("models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // An AI provider id the Gateway serves (openai, groq, ...).
  provider: text("provider").notNull(),
  // The model name the provider itself expects.
  upstreamModel: text("upstream_model").notNull(),
  inputModalities: text("input_modalities").notNull().default("text"),
  outputModalities: text("output_modalities").notNull().default("text"),
  contextLength: integer("context_length").notNull(),
  // US dollars per million tokens.
  inputPrice: real("input_price").notNull(),
  outputPrice: real("output_price").notNull(),
  description: text("description").notNull().default(""),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    modelId: text("model_id").notNull(),
    // JSON array of model ids, tried in order after modelId.
    fallbackModelIds: text("fallback_model_ids").notNull().default("[]"),
    systemPrompt: text("system_prompt").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("conversations_user_idx").on(t.userId, t.updatedAt)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    modelId: text("model_id"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    cost: real("cost"),
    seq: integer("seq").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.seq)],
);

/** One attempt at one model: an API call or a chat reply. */
export const generations = sqliteTable(
  "generations",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    userId: text("user_id").notNull(),
    userEmail: text("user_email").notNull(),
    source: text("source", { enum: ["api", "chat"] }).notNull(),
    modelId: text("model_id").notNull(),
    provider: text("provider").notNull(),
    attempt: integer("attempt").notNull(),
    status: text("status", { enum: ["success", "error"] }).notNull(),
    error: text("error"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    cost: real("cost").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("generations_user_idx").on(t.userId, t.createdAt),
    index("generations_created_idx").on(t.createdAt),
  ],
);
