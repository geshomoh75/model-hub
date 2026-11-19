// The routing core behind POST /api/v1/chat/completions and the chat
// playground: resolve the requested models in the catalogue, try them in
// order through the Gateway's AI providers, and log every attempt.
import { env, waitUntil } from "cloudflare:workers";
import {
  aiBaseUrl,
  createGatewayFetch,
  gatewayRefusal,
  refusalFromError,
} from "@every-app/sdk/server";
import { z } from "zod";
import { db } from "@/db";
import { generations } from "@/db/schema";
import { enabledModelsById, type Model } from "@/server/catalog";
import { candidateIds, costOf } from "@/lib/format";

const message = z
  .object({
    role: z.enum(["system", "developer", "user", "assistant", "tool"]),
    content: z.union([z.string(), z.array(z.unknown()), z.null()]),
    name: z.string().optional(),
    tool_call_id: z.string().optional(),
    tool_calls: z.array(z.unknown()).optional(),
  })
  .strip();

export const completionRequest = z
  .object({
    model: z.string().min(1).optional(),
    models: z.array(z.string().min(1)).max(10).optional(),
    messages: z.array(message).min(1),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().positive().optional(),
    stream: z.boolean().optional(),
  })
  .strip();

export type CompletionRequest = z.infer<typeof completionRequest>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function apiErrorResponse(error: ApiError): Response {
  return Response.json(
    { error: { message: error.message, type: error.type, code: error.code, param: null } },
    { status: error.status },
  );
}

interface Caller {
  id: string;
  email: string;
}

type Generation = typeof generations.$inferInsert;

export interface Answer {
  model: Model;
  body: {
    id: string;
    object: "chat.completion";
    created: number;
    model: string;
    provider: string;
    choices: unknown[];
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost: number };
  };
}

interface Failure {
  notConfigured: boolean;
  message: string;
}

/**
 * Tries each requested model in order until one answers. Returns the JSON
 * answer, or a streaming Response when `stream` is set. Throws ApiError.
 */
export async function complete(
  caller: Caller,
  source: "api" | "chat",
  request: CompletionRequest,
): Promise<{ kind: "json"; answer: Answer } | { kind: "stream"; response: Response }> {
  const ids = candidateIds(request.model, request.models);
  if (ids.length === 0) {
    throw new ApiError(400, "invalid_request_error", "missing_model", "Name a model, or a list of models.");
  }
  const found = await enabledModelsById(ids);
  const candidates: Model[] = [];
  for (const id of ids) {
    const model = found.find((row) => row.id === id);
    if (!model) {
      throw new ApiError(404, "invalid_request_error", "model_not_found", `The model ${id} does not exist or is disabled.`);
    }
    candidates.push(model);
  }

  const requestId = crypto.randomUUID();
  const record = (model: Model, attempt: number, started: number, fields: Partial<Generation>): Generation => ({
    id: crypto.randomUUID(),
    requestId,
    userId: caller.id,
    userEmail: caller.email,
    source,
    modelId: model.id,
    provider: model.provider,
    attempt,
    status: "error",
    latencyMs: Date.now() - started,
    createdAt: new Date(started).toISOString(),
    ...fields,
  });
  const logged: Generation[] = [];
  const failures: Failure[] = [];

  for (const [index, model] of candidates.entries()) {
    const attempt = index + 1;
    const started = Date.now();
    const fail = (failure: Failure) => {
      failures.push(failure);
      logged.push(record(model, attempt, started, { error: failure.message.slice(0, 500) }));
    };
    let response: Response;
    try {
      const gatewayFetch = createGatewayFetch({ env });
      response = await gatewayFetch(`${aiBaseUrl(model.provider)}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: model.upstreamModel,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.max_tokens,
          ...(request.stream ? { stream: true, stream_options: { include_usage: true } } : {}),
        }),
      });
    } catch (error) {
      const refusal = refusalFromError(error);
      fail({
        notConfigured: refusal ? /not_configured$/.test(refusal.code) : false,
        message: refusal ? (refusal.setup ?? refusal.message) : errorText(error),
      });
      continue;
    }
    const refusal = await gatewayRefusal(response.clone());
    if (refusal) {
      fail({ notConfigured: /not_configured$/.test(refusal.code), message: refusal.setup ?? refusal.message });
      continue;
    }
    if (!response.ok) {
      fail({ notConfigured: false, message: `${model.provider} answered ${response.status}: ${await upstreamMessage(response)}` });
      continue;
    }

    if (request.stream && response.body) {
      await saveGenerations(logged);
      return { kind: "stream", response: relayStream(response.body, model, (usage) =>
        saveGenerations([record(model, attempt, started, {
          status: "success",
          promptTokens: usage.prompt,
          completionTokens: usage.completion,
          cost: costOf(model, usage.prompt, usage.completion),
        })]),
      ) };
    }

    let data: { id?: string; created?: number; choices?: unknown[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    try {
      data = await response.json();
    } catch {
      fail({ notConfigured: false, message: `${model.provider} sent an answer that isn't JSON` });
      continue;
    }
    const prompt = data.usage?.prompt_tokens ?? 0;
    const completion = data.usage?.completion_tokens ?? 0;
    const cost = costOf(model, prompt, completion);
    logged.push(record(model, attempt, started, {
      status: "success",
      promptTokens: prompt,
      completionTokens: completion,
      cost,
    }));
    await saveGenerations(logged);
    return {
      kind: "json",
      answer: {
        model,
        body: {
          id: `gen-${requestId}`,
          object: "chat.completion",
          created: data.created ?? Math.floor(started / 1000),
          model: model.id,
          provider: model.provider,
          choices: data.choices ?? [],
          usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion, cost },
        },
      },
    };
  }

  await saveGenerations(logged);
  const detail = failures.map((f, i) => `${candidates[i]!.id}: ${f.message}`).join(" ");
  if (failures.every((f) => f.notConfigured)) {
    throw new ApiError(503, "service_unavailable", "provider_not_configured", detail);
  }
  throw new ApiError(502, "upstream_error", "upstream_error", detail);
}

async function saveGenerations(rows: Generation[]) {
  if (rows.length === 0) return;
  const [first, ...rest] = rows.map((row) => db.insert(generations).values(row));
  await db.batch([first!, ...rest]);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "The call failed";
}

async function upstreamMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === "string") return parsed.error;
    return parsed.error?.message ?? parsed.message ?? text.slice(0, 200);
  } catch {
    return text.slice(0, 200) || response.statusText;
  }
}

/**
 * Passes the provider's SSE through, naming the catalogue model in each
 * chunk, and logs the usage once the stream ends.
 */
function relayStream(
  body: ReadableStream<Uint8Array>,
  model: Model,
  done: (usage: { prompt: number; completion: number }) => Promise<void>,
): Response {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const usage = { prompt: 0, completion: 0 };
  const relayLine = (line: string): string => {
    if (!line.startsWith("data:")) return line;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") return "data: [DONE]";
    try {
      const chunk = JSON.parse(payload) as { model?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      chunk.model = model.id;
      if (chunk.usage) {
        usage.prompt = chunk.usage.prompt_tokens ?? usage.prompt;
        usage.completion = chunk.usage.completion_tokens ?? usage.completion;
      }
      return `data: ${JSON.stringify(chunk)}`;
    } catch {
      return line;
    }
  };
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(bytes, controller) {
      buffer += decoder.decode(bytes, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      if (lines.length) controller.enqueue(encoder.encode(lines.map(relayLine).join("\n") + "\n"));
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer) controller.enqueue(encoder.encode(relayLine(buffer)));
      waitUntil(done(usage));
    },
  });
  return new Response(body.pipeThrough(transform), {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}
