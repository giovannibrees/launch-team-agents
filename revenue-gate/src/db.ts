import type { Env } from "./index";

export function getDb(env: Env): D1Database {
  return env.DB;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nanoid(size = 12): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let id = "";
  for (const b of bytes) id += chars[b % chars.length];
  return id;
}
