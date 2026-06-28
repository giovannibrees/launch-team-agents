import { Hono } from "hono";
import type { Env } from "../index";
import { nanoid, today } from "../db";

export const taskRoutes = new Hono<{ Bindings: Env }>();

taskRoutes.post("/", async (c) => {
  const body = await c.req.json<{
    day?: string;
    title: string;
    category: "money" | "creative" | "ops";
    est_min: number;
    sort_order?: number;
  }>();

  const day = body.day || today();
  const db = c.env.DB;

  const existing = await db
    .prepare("SELECT day FROM day_meta WHERE day = ?")
    .bind(day)
    .first();
  if (!existing) {
    await db
      .prepare("INSERT INTO day_meta (day, gate_open, streak) VALUES (?, 0, 0)")
      .bind(day)
      .run();
  }

  const id = nanoid();
  await db
    .prepare(
      `INSERT INTO tasks (id, day, title, category, est_min, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, day, body.title, body.category, body.est_min, body.sort_order ?? 0)
    .run();

  const task = await db
    .prepare("SELECT * FROM tasks WHERE id = ?")
    .bind(id)
    .first();

  return c.json(task, 201);
});

taskRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    status?: "todo" | "doing" | "done";
    title?: string;
    est_min?: number;
  }>();
  const db = c.env.DB;

  const task = await db
    .prepare("SELECT * FROM tasks WHERE id = ?")
    .bind(id)
    .first<{
      id: string;
      day: string;
      status: string;
      category: string;
      started_at: string | null;
      accum_sec: number;
    }>();

  if (!task) return c.json({ error: "not found" }, 404);

  if (body.status) {
    if (body.status === "doing") {
      // Stop any other running task for this day
      const running = await db
        .prepare("SELECT id, started_at FROM tasks WHERE day = ? AND status = 'doing'")
        .bind(task.day)
        .first<{ id: string; started_at: string }>();

      if (running && running.id !== id) {
        const elapsed = Math.floor(
          (Date.now() - new Date(running.started_at).getTime()) / 1000
        );
        await db
          .prepare(
            "UPDATE tasks SET status = 'todo', accum_sec = accum_sec + ?, started_at = NULL WHERE id = ?"
          )
          .bind(elapsed, running.id)
          .run();
      }

      // Check gate: creative tasks blocked until a money task is done
      if (task.category === "creative") {
        const gateOpen = await db
          .prepare(
            "SELECT 1 FROM tasks WHERE day = ? AND category = 'money' AND status = 'done' LIMIT 1"
          )
          .bind(task.day)
          .first();
        if (!gateOpen) {
          return c.json({ error: "gate_locked", message: "Complete a money task first" }, 403);
        }
      }

      await db
        .prepare(
          "UPDATE tasks SET status = 'doing', started_at = ? WHERE id = ?"
        )
        .bind(new Date().toISOString(), id)
        .run();
    } else if (body.status === "done") {
      let accum = task.accum_sec;
      if (task.started_at) {
        accum += Math.floor(
          (Date.now() - new Date(task.started_at).getTime()) / 1000
        );
      }

      await db
        .prepare(
          "UPDATE tasks SET status = 'done', accum_sec = ?, started_at = NULL WHERE id = ?"
        )
        .bind(accum, id)
        .run();

      // If money task done, open gate + update streak
      if (task.category === "money") {
        const dayMeta = await db
          .prepare("SELECT gate_open, streak FROM day_meta WHERE day = ?")
          .bind(task.day)
          .first<{ gate_open: number; streak: number }>();

        if (dayMeta && !dayMeta.gate_open) {
          // Get yesterday's streak
          const yesterday = new Date(
            new Date(task.day).getTime() - 86400000
          )
            .toISOString()
            .slice(0, 10);
          const prevDay = await db
            .prepare("SELECT streak FROM day_meta WHERE day = ?")
            .bind(yesterday)
            .first<{ streak: number }>();

          const newStreak = (prevDay?.streak ?? 0) + 1;

          await db
            .prepare(
              "UPDATE day_meta SET gate_open = 1, streak = ? WHERE day = ?"
            )
            .bind(newStreak, task.day)
            .run();

          await db
            .prepare(
              "INSERT INTO app_meta (key, value) VALUES ('streak', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
            )
            .bind(String(newStreak), String(newStreak))
            .run();
        }
      }
    } else if (body.status === "todo") {
      let accum = task.accum_sec;
      if (task.started_at) {
        accum += Math.floor(
          (Date.now() - new Date(task.started_at).getTime()) / 1000
        );
      }
      await db
        .prepare(
          "UPDATE tasks SET status = 'todo', accum_sec = ?, started_at = NULL WHERE id = ?"
        )
        .bind(accum, id)
        .run();
    }
  }

  if (body.title) {
    await db
      .prepare("UPDATE tasks SET title = ? WHERE id = ?")
      .bind(body.title, id)
      .run();
  }

  if (body.est_min !== undefined) {
    await db
      .prepare("UPDATE tasks SET est_min = ? WHERE id = ?")
      .bind(body.est_min, id)
      .run();
  }

  const updated = await db
    .prepare("SELECT * FROM tasks WHERE id = ?")
    .bind(id)
    .first();

  return c.json(updated);
});

taskRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const task = await db
    .prepare("SELECT id FROM tasks WHERE id = ?")
    .bind(id)
    .first();
  if (!task) return c.json({ error: "not found" }, 404);

  await db.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});
