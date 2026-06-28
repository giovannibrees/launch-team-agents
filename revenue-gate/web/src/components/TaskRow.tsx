import { useEffect, useState } from "react";
import type { Task } from "../types";
import { updateTask, deleteTask } from "../api";
import { liveElapsed, fmtTime } from "../logic";

const categoryColors: Record<string, string> = {
  money: "border-money/40 bg-money/5",
  creative: "border-creative/40 bg-creative/5",
  ops: "border-ops/40 bg-ops/5",
};

const categoryBadge: Record<string, string> = {
  money: "bg-money/20 text-money",
  creative: "bg-creative/20 text-creative",
  ops: "bg-ops/20 text-ops",
};

export function TaskRow({
  task,
  gateLocked,
  onUpdate,
}: {
  task: Task;
  gateLocked: boolean;
  onUpdate: () => void;
}) {
  const [elapsed, setElapsed] = useState(liveElapsed(task));

  useEffect(() => {
    if (task.status !== "doing") {
      setElapsed(liveElapsed(task));
      return;
    }
    const interval = setInterval(() => setElapsed(liveElapsed(task)), 1000);
    return () => clearInterval(interval);
  }, [task]);

  const overBudget = elapsed > task.est_min * 60;

  const handleAction = async () => {
    if (task.status === "todo") {
      try {
        await updateTask(task.id, { status: "doing" });
      } catch (e: any) {
        if (e.body?.error === "gate_locked") {
          alert("Complete a money task first to unlock creative tasks.");
          return;
        }
        throw e;
      }
    } else if (task.status === "doing") {
      await updateTask(task.id, { status: "done" });
    }
    onUpdate();
  };

  const handlePause = async () => {
    await updateTask(task.id, { status: "todo" });
    onUpdate();
  };

  const handleDelete = async () => {
    await deleteTask(task.id);
    onUpdate();
  };

  return (
    <div
      className={`border rounded-lg p-3 ${categoryColors[task.category]} ${
        task.status === "done" ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs px-1.5 py-0.5 rounded ${categoryBadge[task.category]}`}>
            {task.category}
          </span>
          <span className={`truncate ${task.status === "done" ? "line-through" : ""}`}>
            {task.title}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-sm tabular-nums ${overBudget ? "text-red-400" : "text-zinc-400"}`}>
            {fmtTime(elapsed)} / {task.est_min}m
          </span>
          {task.status === "doing" && (
            <button
              onClick={handlePause}
              className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600"
            >
              Pause
            </button>
          )}
          {task.status !== "done" && (
            <button
              onClick={handleAction}
              disabled={gateLocked && task.status === "todo"}
              className={`text-xs px-2 py-1 rounded font-medium ${
                task.status === "doing"
                  ? "bg-money text-zinc-950 hover:bg-money/80"
                  : gateLocked
                    ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                    : "bg-zinc-700 hover:bg-zinc-600"
              }`}
            >
              {task.status === "doing" ? "Done" : "Start"}
            </button>
          )}
          {task.status === "todo" && (
            <button
              onClick={handleDelete}
              className="text-zinc-600 hover:text-red-400 text-xs"
            >
              &times;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
