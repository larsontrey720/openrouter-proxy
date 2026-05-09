import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  return res.status(200).json({
    service: "openrouter-proxy",
    version: "1.0.0",
    endpoints: {
      chat_completions: "POST /v1/chat/completions",
    },
    features: [
      "5x retry with exponential backoff on 500/502/503/504",
      "BYOK provider routing via 'provider' parameter",
      "SSE streaming passthrough",
      "OpenAI-compatible drop-in replacement",
    ],
  });
}
