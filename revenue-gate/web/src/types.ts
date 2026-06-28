export type Category = "money" | "creative" | "ops";
export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: string;
  day: string;
  title: string;
  category: Category;
  est_min: number;
  accum_sec: number;
  started_at: string | null;
  status: TaskStatus;
  sort_order: number;
  created_at: string;
}

export interface DayMeta {
  day: string;
  gate_open: number;
  streak: number;
}

export interface DayResponse {
  day: DayMeta;
  tasks: Task[];
  multiplier: number;
}

export interface ParsedTask {
  title: string;
  category: Category;
  est_min: number;
}

export interface Standing {
  id: string;
  title: string;
  category: Category;
  est_min: number;
  active: number;
}
