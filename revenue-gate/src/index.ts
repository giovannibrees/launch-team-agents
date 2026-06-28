import { Hono } from "hono";
import { cors } from "hono/cors";
import { dayRoutes } from "./routes/day";
import { taskRoutes } from "./routes/tasks";
import { parseRoutes } from "./routes/parse";
import { standingRoutes } from "./routes/standing";

export type Env = {
  DB: D1Database;
  APP_SECRET: string;
  ANTHROPIC_API_KEY: string;
  PARSE_MODEL: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());

app.use("/api/*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${c.env.APP_SECRET}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

app.get("/api/meta", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT value FROM app_meta WHERE key = 'streak'"
  ).first<{ value: string }>();
  return c.json({ streak: row ? Number(row.value) : 0 });
});

app.route("/api/day", dayRoutes);
app.route("/api/tasks", taskRoutes);
app.route("/api/parse", parseRoutes);
app.route("/api/standing", standingRoutes);

export default app;
