import { useCallback, useEffect, useState } from "react";
import type { DayResponse } from "./types";
import { fetchDay, getToken, setToken } from "./api";
import { TruthPanel } from "./components/TruthPanel";
import { TaskRow } from "./components/TaskRow";
import { AddTaskForm } from "./components/AddTaskForm";
import { ImportCard } from "./components/ImportCard";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [tokenInput, setTokenInput] = useState("");
  const [data, setData] = useState<DayResponse | null>(null);
  const [day, setDay] = useState(todayStr());
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await fetchDay(day);
      setData(d);
      setError("");
    } catch (e: any) {
      if (e.status === 401) {
        setAuthed(false);
        setToken("");
      } else {
        setError(e.message);
      }
    }
  }, [day]);

  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-surface-raised p-8 rounded-xl max-w-sm w-full">
          <h1 className="text-2xl font-bold text-gold mb-6">Revenue Gate</h1>
          <input
            type="password"
            placeholder="Enter token"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tokenInput) {
                setToken(tokenInput);
                setAuthed(true);
              }
            }}
            className="w-full bg-surface border border-zinc-700 rounded px-3 py-2 mb-4 focus:border-gold outline-none"
          />
          <button
            onClick={() => {
              if (tokenInput) {
                setToken(tokenInput);
                setAuthed(true);
              }
            }}
            className="w-full bg-gold text-zinc-950 font-semibold py-2 rounded hover:bg-gold-dim"
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  const shiftDay = (delta: number) => {
    const d = new Date(day);
    d.setDate(d.getDate() + delta);
    setDay(d.toISOString().slice(0, 10));
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <TruthPanel
        multiplier={data.multiplier}
        streak={data.day.streak}
        gateOpen={!!data.day.gate_open}
      />

      <div className="flex items-center justify-between my-6">
        <button onClick={() => shiftDay(-1)} className="text-zinc-500 hover:text-zinc-300 text-xl px-2">&larr;</button>
        <h2 className="text-lg font-medium">
          {day === todayStr() ? "Today" : day}
        </h2>
        <button onClick={() => shiftDay(1)} className="text-zinc-500 hover:text-zinc-300 text-xl px-2">&rarr;</button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 px-3 py-2 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-2 mb-6">
        {data.tasks.length === 0 && (
          <p className="text-zinc-600 text-center py-8">No tasks yet</p>
        )}
        {data.tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            gateLocked={
              t.category === "creative" && !data.day.gate_open
            }
            onUpdate={load}
          />
        ))}
      </div>

      <AddTaskForm day={day} onAdded={load} />

      <div className="mt-8">
        <ImportCard day={day} onImported={load} />
      </div>
    </div>
  );
}
