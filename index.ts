import { Hono } from "hono";
import { handle } from "hono/vercel";
import chatCompletions from "./api/v1/chat/completions";

const app = new Hono();

app.post("/v1/chat/completions", chatCompletions);

app.all("*", (c) => {
  return c.json(
    {
      error: "Not found",
      hint: "POST to /v1/chat/completions with OpenAI-compatible body. Add a 'provider' object for BYOK routing (e.g. { provider: { only: ['google'] } })",
    },
    404
  );
});

export const POST = handle(app);
export const GET = handle(app);
