export const config = {
  runtime: 'edge',
};

interface KeyState {
  key: string;
  cooldownUntil: number;
  last429At: number;
}

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 500;
const RATE_LIMIT_COOLDOWN_MS = 60000;

function getApiKeys(): KeyState[] {
  const keys: KeyState[] = [];
  let i = 1;
  while (true) {
    const key = process.env[`OPENROUTER_API_KEY_${i}`] || (i === 1 ? process.env.OPENROUTER_API_KEY : undefined);
    if (!key) break;
    keys.push({ key, cooldownUntil: 0, last429At: 0 });
    i++;
  }
  return keys;
}

function getNextAvailableKey(keys: KeyState[]): KeyState | null {
  const now = Date.now();
  const available = keys.filter(k => now >= k.cooldownUntil);
  if (available.length === 0) {
    let minCooldown = Infinity;
    let nextAvailableKey: KeyState | null = null;
    for (const k of keys) {
      const waitTime = k.cooldownUntil - now;
      if (waitTime < minCooldown) {
        minCooldown = waitTime;
        nextAvailableKey = k;
      }
    }
    return nextAvailableKey;
  }
  available.sort((a, b) => (a.last429At || 0) - (b.last429At || 0));
  return available[0];
}

function markKeyRateLimited(keys: KeyState[], key: string): void {
  const k = keys.find(k => k.key === key);
  if (k) {
    k.last429At = Date.now();
    k.cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
  }
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/(api\/)?(v1\/)?/, '/');
  const targetUrl = `https://openrouter.ai/api/v1${path}`;

  console.log(`[INBOUND] ${req.method} ${url.pathname} -> ${targetUrl}`);

  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('origin');

  if (!headers.has('content-type')) {
    headers.set('Content-Type', 'application/json');
  }

  let body: string | null = null;
  let clientWantsStream = false;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.text();
    if (body) {
      try {
        const parsed = JSON.parse(body);
        clientWantsStream = parsed.stream === true;
        parsed.stream = true;
        body = JSON.stringify(parsed);
      } catch {}
    }
    headers.set('Content-Length', String(body?.length ?? 0));
  }

  const keys = getApiKeys();
  if (keys.length === 0) {
    return new Response(JSON.stringify({ error: 'No OpenRouter API keys configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let lastError: any = null;
  let attempts = 0;

  while (attempts <= MAX_RETRIES) {
    const keyState = getNextAvailableKey(keys);
    if (!keyState) {
      return new Response(JSON.stringify({ 
        error: 'All keys rate limited', 
        message: 'All API keys are currently in cooldown. Try again later.' 
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    headers.set('Authorization', `Bearer ${keyState.key}`);

    try {
      console.log(`[ATTEMPT ${attempts + 1}/${MAX_RETRIES + 1}] key ending in ...${keyState.key.slice(-4)}`);
      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: body ?? undefined,
      });

      if (response.status === 429) {
        console.log(`Rate limited on key ...${keyState.key.slice(-4)}`);
        markKeyRateLimited(keys, keyState.key);
        attempts++;
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempts);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        console.log(`Upstream error ${response.status}: ${errText.slice(0, 200)}`);
        if (attempts < MAX_RETRIES && (response.status >= 500 || response.status === 429)) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempts);
          await new Promise(resolve => setTimeout(resolve, delay));
          attempts++;
          continue;
        }
        return new Response(errText, {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!response.body) {
        const data = await response.text();
        return new Response(data, {
          status: response.status,
          headers: response.headers,
        });
      }

      if (clientWantsStream) {
        return new Response(response.body, {
          status: response.status,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        });
      } else {
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (error: any) {
      lastError = error;
      console.log(`Fetch error: ${error.message}`);
      attempts++;
      if (attempts <= MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempts);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error('All retries exhausted:', lastError);
  return new Response(JSON.stringify({ error: 'Proxy Error', message: lastError?.message || 'Unknown error' }), {
    status: 502,
    headers: { 'Content-Type': 'application/json' },
  });
}