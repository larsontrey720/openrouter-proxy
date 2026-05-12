# OpenRouter Proxy

An OpenAI-compatible proxy for OpenRouter with automatic key rotation on 429 rate limit errors.

## Features

- **Multi-key support**: Configure up to 10+ API keys
- **Automatic key rotation**: On 429 errors, automatically switches to the next available key
- **Cooldown handling**: Rate-limited keys are temporarily disabled for 60 seconds
- **Exponential backoff**: Retries with increasing delays
- **OpenAI compatibility**: Works with existing OpenAI SDKs

## Setup

### Environment Variables

Configure your OpenRouter API keys as environment variables:

```bash
# Single key (fallback)
OPENROUTER_API_KEY=your_api_key_here

# Or multiple keys for rotation (recommended)
OPENROUTER_API_KEY_1=first_key
OPENROUTER_API_KEY_2=second_key
OPENROUTER_API_KEY_3=third_key
# ... up to OPENROUTER_API_KEY_10
```

### Deploy to Vercel

```bash
npm install -g vercel
vercel
```

## Usage

Once deployed, use the proxy with your OpenAI SDK:

```javascript
const response = await fetch('https://your-proxy.vercel.app/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'anthropic/claude-3-opus',
    messages: [{ role: 'user', content: 'Hello!' }],
  }),
});
```

## Endpoints

- `POST /v1/chat/completions` - OpenAI-compatible chat completions
- `POST /api/chat/completions` - Alternative path
- `GET /` - Service info (served from public/index.html)

## How It Works

1. On each request, the proxy checks all configured keys for availability
2. If a key returns 429, it's marked as rate-limited and enters a 60-second cooldown
3. The proxy automatically tries the next available key
4. If all keys are rate-limited, returns 429 with an error message