import { Hono } from "hono";
import type { Env } from "../index";

export const parseRoutes = new Hono<{ Bindings: Env }>();

parseRoutes.post("/", async (c) => {
  const body = await c.req.json<{
    image_b64?: string;
    text?: string;
  }>();

  if (!body.image_b64 && !body.text) {
    return c.json({ error: "provide image_b64 or text" }, 400);
  }

  const content: any[] = [
    {
      type: "text",
      text: `Extract every task or event from the input below.
Return a JSON array. Each element:
{ "title": string, "category": "money"|"creative"|"ops", "est_min": integer }
Rules:
- Meetings, calls, admin → "ops"
- Revenue, client, sales, invoicing → "money"
- Design, writing, coding side-projects → "creative"
- est_min = your best guess of minutes needed
Return ONLY the JSON array, no markdown fences, no commentary.`,
    },
  ];

  if (body.image_b64) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: body.image_b64,
      },
    });
  }

  if (body.text) {
    content.push({
      type: "text",
      text: `\n---\n${body.text}`,
    });
  }

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": c.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: c.env.PARSE_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return c.json({ error: "anthropic_error", detail: err }, 502);
  }

  const result = (await resp.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const text = result.content.find((b) => b.type === "text")?.text ?? "[]";

  try {
    const tasks = JSON.parse(text);
    return c.json({ tasks });
  } catch {
    return c.json({ tasks: [], raw: text });
  }
});
