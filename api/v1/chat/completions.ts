import type { VercelRequest, VercelResponse } from "@vercel/node";

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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, HTTP-Referer, X-Title");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed", hint: "POST to /v1/chat/completions" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });
  }

  let body: Record<string, unknown>;
  try {
    body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body);
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { provider, ...rest } = body;

  const upstreamBody: Record<string, unknown> = { ...rest };
  if (provider && typeof provider === "object") {
    upstreamBody.provider = {
      ...provider,
      allow_fallbacks: false,
    };
  }

  const isStream = upstreamBody.stream === true;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const httpReferer = req.headers["http-referer"] as string | undefined;
  if (httpReferer) headers["HTTP-Referer"] = httpReferer;

  const xTitle = req.headers["x-title"] as string | undefined;
  if (xTitle) headers["X-Title"] = xTitle;

  const upstreamUrl = `${OPENROUTER_API_BASE}/chat/completions`;

  try {
    const response = await fetchWithRetry(upstreamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamBody),
    });

    res.setHeader("Access-Control-Allow-Origin", "*");

    if (isStream && response.ok && response.body) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (streamErr) {
        console.error("[proxy] stream error:", streamErr);
      }
      return res.end();
    }

    const data = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      res.setHeader("Content-Type", "application/json");
      return res.status(response.status).json({ raw: data });
    }

    return res.status(response.status).json(parsed);
  } catch (err) {
    console.error("[proxy] fatal error:", err);
    return res.status(502).json({ error: "Proxy request failed", detail: String(err) });
  }
}
