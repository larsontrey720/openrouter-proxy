import type { Context } from "hono";

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";
const MAX_RETRIES = 5;
const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackoffMs(retryCount: number): number {
  const base = 1000;
  return base * Math.pow(2, retryCount) + Math.floor(Math.random() * 500);
}

async function fetchWithRetry(
  url: string,
  options: RequestInit
): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, options);

    if (!RETRYABLE_STATUS.has(response.status)) {
      return response;
    }

    lastResponse = response;

    if (attempt < MAX_RETRIES) {
      const backoff = getBackoffMs(attempt);
      console.error(
        `[retry] ${response.status} from OpenRouter (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${backoff}ms...`
      );
      await sleep(backoff);
    }
  }

  return lastResponse!;
}

export default async (c: Context) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return c.json({ error: "OPENROUTER_API_KEY not configured" }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { provider, ...rest } = body;

  const upstreamBody: Record<string, unknown> = { ...rest };
  if (provider && typeof provider === "object") {
    upstreamBody.provider = provider;
  }

  const isStream = upstreamBody.stream === true;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const httpReferer = c.req.header("HTTP-Referer");
  if (httpReferer) headers["HTTP-Referer"] = httpReferer;

  const xTitle = c.req.header("X-Title");
  if (xTitle) headers["X-Title"] = xTitle;

  const upstreamUrl = `${OPENROUTER_API_BASE}/chat/completions`;

  try {
    const response = await fetchWithRetry(upstreamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamBody),
    });

    if (isStream && response.ok && response.body) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const data = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return new Response(data, { status: response.status });
    }

    return c.json(parsed, response.status as 200);
  } catch (err) {
    console.error("[proxy] fatal error:", err);
    return c.json(
      { error: "Proxy request failed", detail: String(err) },
      502
    );
  }
};
