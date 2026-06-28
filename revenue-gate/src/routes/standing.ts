import { Hono } from "hono";
import type { Env } from "../index";
import { nanoid } from "../db";

export const standingRoutes = new Hono<{ Bindings: Env }>();

standingRoutes.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM standing WHERE active = 1 ORDER BY category, title"
  ).all();
  return c.json(rows.results);
});

standingRoutes.post("/", async (c) => {
  const body = await c.req.json<{
    title: string;
    category: "money" | "creative" | "ops";
    est_min: number;
  }>();

  const id = nanoid();
  await c.env.DB.prepare(
    "INSERT INTO standing (id, title, category, est_min) VALUES (?, ?, ?, ?)"
  )
    .bind(id, body.title, body.category, body.est_min)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM standing WHERE id = ?")
    .bind(id)
    .first();
  return c.json(row, 201);
});

standingRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    title?: string;
    category?: string;
    est_min?: number;
    active?: number;
  }>();

  const sets: string[] = [];
  const vals: any[] = [];

  if (body.title !== undefined) { sets.push("title = ?"); vals.push(body.title); }
  if (body.category !== undefined) { sets.push("category = ?"); vals.push(body.category); }
  if (body.est_min !== undefined) { sets.push("est_min = ?"); vals.push(body.est_min); }
  if (body.active !== undefined) { sets.push("active = ?"); vals.push(body.active); }

  if (sets.length === 0) return c.json({ error: "nothing to update" }, 400);

  vals.push(id);
  await c.env.DB.prepare(
    `UPDATE standing SET ${sets.join(", ")} WHERE id = ?`
  )
    .bind(...vals)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM standing WHERE id = ?")
    .bind(id)
    .first();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

standingRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM standing WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});
