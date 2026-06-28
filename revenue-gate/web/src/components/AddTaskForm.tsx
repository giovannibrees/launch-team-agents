import { useState } from "react";
import type { Category } from "../types";
import { createTask } from "../api";

export function AddTaskForm({
  day,
  onAdded,
}: {
  day: string;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("money");
  const [estMin, setEstMin] = useState("");
  const [open, setOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !estMin) return;
    await createTask({
      day,
      title,
      category,
      est_min: Number(estMin),
    });
    setTitle("");
    setEstMin("");
    setOpen(false);
    onAdded();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full border border-dashed border-zinc-700 rounded-lg py-3 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500"
      >
        + Add task
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-raised rounded-lg p-4 space-y-3">
      <input
        autoFocus
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full bg-surface border border-zinc-700 rounded px-3 py-2 focus:border-gold outline-none"
      />
      <div className="flex gap-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          className="bg-surface border border-zinc-700 rounded px-3 py-2 focus:border-gold outline-none"
        >
          <option value="money">Money</option>
          <option value="creative">Creative</option>
          <option value="ops">Ops</option>
        </select>
        <input
          type="number"
          placeholder="Est. min"
          min={1}
          value={estMin}
          onChange={(e) => setEstMin(e.target.value)}
          className="w-24 bg-surface border border-zinc-700 rounded px-3 py-2 focus:border-gold outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="bg-gold text-zinc-950 font-semibold px-4 py-2 rounded hover:bg-gold-dim"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-zinc-500 hover:text-zinc-300 px-4 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
