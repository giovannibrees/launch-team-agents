import { Hono } from "hono";
import type { Env } from "../index";
import { today } from "../db";

export const dayRoutes = new Hono<{ Bindings: Env }>();

dayRoutes.get("/:day?", async (c) => {
  const day = c.req.param("day") || today();
  const db = c.env.DB;

  let meta = await db
    .prepare("SELECT * FROM day_meta WHERE day = ?")
    .bind(day)
    .first();

  if (!meta) {
    await db
      .prepare("INSERT INTO day_meta (day, gate_open, streak) VALUES (?, 0, 0)")
      .bind(day)
      .run();
    meta = { day, gate_open: 0, streak: 0 };
  }

  const tasks = await db
    .prepare(
      "SELECT * FROM tasks WHERE day = ? ORDER BY sort_order, created_at"
    )
    .bind(day)
    .all();

  const statsRow = await db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN status='done' THEN accum_sec END), 0) as actual_sec,
        COALESCE(SUM(CASE WHEN status='done' THEN est_min END), 0) as est_min_total
       FROM tasks WHERE status='done'`
    )
    .first<{ actual_sec: number; est_min_total: number }>();

  const actual_min = (statsRow?.actual_sec ?? 0) / 60;
  const est_min_total = statsRow?.est_min_total ?? 0;
  const multiplier = est_min_total > 0 ? actual_min / est_min_total : 1;

  return c.json({
    day: meta,
    tasks: tasks.results,
    multiplier: Math.round(multiplier * 100) / 100,
  });
});
