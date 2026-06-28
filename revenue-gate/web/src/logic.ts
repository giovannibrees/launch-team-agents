import type { Task } from "./types";

export function liveElapsed(task: Task): number {
  let sec = task.accum_sec;
  if (task.started_at) {
    sec += Math.floor((Date.now() - new Date(task.started_at).getTime()) / 1000);
  }
  return sec;
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function isGateLocked(tasks: Task[], category: string): boolean {
  if (category !== "creative") return false;
  return !tasks.some((t) => t.category === "money" && t.status === "done");
}

export function multiplierColor(m: number): string {
  if (m <= 1.1) return "text-money";
  if (m <= 1.5) return "text-gold";
  return "text-red-400";
}
