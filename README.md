# Model Hub

A private gateway to the AI models your team uses: one OpenAI-compatible API with fallbacks between models, a chat playground, and a log of every call with its tokens and cost.

Inspired by https://openrouter.ai

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Browse, search, sort and filter the team's model catalogue; admins add, edit, enable and disable models.
- Call any enabled model through `POST /api/v1/chat/completions` with a Gateway personal access token, streaming included.
- List fallback models in `models` and the first one that answers is used and billed.
- Chat with any model in the browser, with fallbacks and a system prompt, in saved private conversations.
- See spend, requests and tokens by day and by model, filter every call, and export the rows as CSV.

Left out: accounts and sign-in, which your Gateway handles; credits and payments; automatic routing and provider preferences; budgets and alerts; public rankings; image, audio and embedding APIs.

## Setup

- Install: `pnpm everyapp install <release URL>`, or from a checkout `pnpm install` then `pnpm run deploy`.
- Run locally: `pnpm dev`. Test: `pnpm test` and `pnpm types:check`.
- The app has no secrets or settings of its own. Each provider (OpenAI, Anthropic, Google Gemini, Groq, Mistral AI, Workers AI) is optional: set the ones your catalogue uses with `pnpm everyapp provider add <id>`. Keys stay on the Gateway.
- Five models are in the catalogue at install; admins edit prices and the provider's model name to match their accounts.

## Limitations

- Prices are what admins enter, not what providers bill.
- A model that fails after its stream has started does not fall back.
- The checks run against a stand-in for the Gateway's AI proxy; calls to real providers were not exercised.
