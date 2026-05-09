# OpenRouter Proxy

OpenAI-compatible proxy for [OpenRouter](https://openrouter.ai) with automatic retry logic and BYOK provider routing.

## Features

- **5x Retry on Server Errors**: Exponential backoff with jitter (1s → 2s → 4s → 8s → 16s) for HTTP 500/502/503/504
- **BYOK Provider Routing**: Pass a `provider` object to control which provider handles your request
- **OpenAI-Compatible**: Drop-in replacement for `/v1/chat/completions`
- **SSE Streaming**: Full passthrough for streaming responses
- **Attribution Headers**: Forwards `HTTP-Referer` and `X-Title` to OpenRouter

## Deployed

**Production**: `https://or-deploy.vercel.app`

## Usage

### Basic chat completion

```bash
curl https://or-deploy.vercel.app/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'
```

### BYOK with provider routing

Force OpenRouter to use only your stored Google AI Studio BYOK key:

```bash
curl https://or-deploy.vercel.app/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-2.5-flash",
    "provider": { "only": ["google"] },
    "messages": [{ "role": "user", "content": "Hello" }]
  }'
```

### Provider options

The `provider` object supports all OpenRouter provider routing fields:

- `provider.only` — Array of provider slugs to use exclusively
- `provider.order` — Array of provider slugs in preference order
- `provider.allow_fallbacks` — Boolean, whether to allow fallback providers
- `provider.ignore` — Array of provider slugs to skip
- `provider.quantizations` — Array of preferred quantization levels

### Streaming

```bash
curl https://or-deploy.vercel.app/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "stream": true,
    "messages": [{ "role": "user", "content": "Hello" }]
  }'
```

## Configuration

Set `OPENROUTER_API_KEY` as an environment variable in Vercel project settings.

## Retry Behavior

| Attempt | Delay (approx) |
|---------|----------------|
| 1       | 1s + jitter    |
| 2       | 2s + jitter    |
| 3       | 4s + jitter    |
| 4       | 8s + jitter    |
| 5       | 16s + jitter   |

Only HTTP 500, 502, 503, 504 trigger retries. 4xx errors (including 429 rate limits) are returned immediately.
