import type { DayResponse, ParsedTask, Standing, Task } from "./types";

let token = localStorage.getItem("rg_token") || "";

export function setToken(t: string) {
  token = t;
  localStorage.setItem("rg_token", t);
}

export function getToken(): string {
  return token;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error((body as any).error || res.statusText), {
      status: res.status,
      body,
    });
  }
  return res.json() as Promise<T>;
}

export const fetchDay = (day?: string) =>
  api<DayResponse>(day ? `/day/${day}` : "/day");

export const createTask = (task: {
  day?: string;
  title: string;
  category: string;
  est_min: number;
}) => api<Task>("/tasks", { method: "POST", body: JSON.stringify(task) });

export const updateTask = (id: string, patch: Record<string, unknown>) =>
  api<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const deleteTask = (id: string) =>
  api<{ ok: boolean }>(`/tasks/${id}`, { method: "DELETE" });

export const parseScreenshot = (payload: { image_b64?: string; text?: string }) =>
  api<{ tasks: ParsedTask[] }>("/parse", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchStanding = () => api<Standing[]>("/standing");

export const createStanding = (s: {
  title: string;
  category: string;
  est_min: number;
}) => api<Standing>("/standing", { method: "POST", body: JSON.stringify(s) });

export const updateStanding = (id: string, patch: Record<string, unknown>) =>
  api<Standing>(`/standing/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

export const deleteStanding = (id: string) =>
  api<{ ok: boolean }>(`/standing/${id}`, { method: "DELETE" });
