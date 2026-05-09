# OpenRouter Proxy

OpenAI-compatible proxy for [OpenRouter](https://openrouter.ai) with automatic retry logic and BYOK provider routing.

## Features

- **5x Retry on 500 Errors**: Exponential backoff with jitter (1s → 2s → 4s → 8s → 16s) for 500/502/503/504 responses
- **BYOK Provider Routing**: Pass a `provider` object to control which provider handles your request (e.g. `{ "provider": { "only": ["google"] } }`)
- **OpenAI-Compatible**: Drop-in replacement for OpenAI `/v1/chat/completions` endpoint
- **Streaming Support**: Full SSE passthrough for streaming responses
- **Attribution Headers**: Forwards `HTTP-Referer` and `X-Title` for OpenRouter rankings

## Deploy

Deploy to Vercel with the `OPENROUTER_API_KEY` environment variable:

```bash
vercel --prod
vercel env add OPENROUTER_API_KEY
```

## Usage

### Basic Chat Completion

```bash
curl https://your-proxy.vercel.app/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### BYOK Provider Routing (Google)

```bash
curl https://your-proxy.vercel.app/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-2.5-flash",
    "provider": {
      "only": ["google"]
    },
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Provider Routing Options

The `provider` object supports these fields:

| Field | Type | Description |
|-------|------|-------------|
| `only` | `string[]` | Only use these providers (e.g. `["google"]`, `["anthropic"]`) |
| `ignore` | `string[]` | Exclude these providers |
| `order` | `string[]` | Preferred provider order |
| `allow_fallbacks` | `boolean` | Allow fallback providers (default: `true`) |
| `require_parameters` | `boolean` | Only use providers supporting all request params |
| `data_collection` | `"allow"\|"deny"` | Allow/deny providers that may store data |
| `sort` | `"price"\|"throughput"\|"latency"` | Sort providers by criteria |

### Streaming

```bash
curl https://your-proxy.vercel.app/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o",
    "stream": true,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Retry Behavior

On 500/502/503/504 responses from OpenRouter, the proxy automatically retries up to 5 times with exponential backoff:

| Retry | Delay |
|-------|-------|
| 1 | ~1s |
| 2 | ~2s |
| 3 | ~4s |
| 4 | ~8s |
| 5 | ~16s |

Jitter (±500ms) is added to prevent thundering herd.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | Your OpenRouter API key |
