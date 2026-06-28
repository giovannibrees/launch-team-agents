import { useState, useRef } from "react";
import type { ParsedTask } from "../types";
import { parseScreenshot, createTask } from "../api";

function downscaleImage(file: File, maxWidth = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      resolve(dataUrl.split(",")[1]);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function ImportCard({
  day,
  onImported,
}: {
  day: string;
  onImported: () => void;
}) {
  const [mode, setMode] = useState<"closed" | "input" | "review">("closed");
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedTask[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleParse = async (payload: { image_b64?: string; text?: string }) => {
    setLoading(true);
    try {
      const res = await parseScreenshot(payload);
      setParsed(res.tasks);
      setSelected(new Set(res.tasks.map((_, i) => i)));
      setMode("review");
    } catch {
      alert("Failed to parse. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await downscaleImage(file);
    handleParse({ image_b64: b64 });
  };

  const handleAddSelected = async () => {
    for (const idx of selected) {
      const t = parsed[idx];
      await createTask({ day, title: t.title, category: t.category, est_min: t.est_min });
    }
    setParsed([]);
    setSelected(new Set());
    setMode("closed");
    setText("");
    onImported();
  };

  const toggleSelect = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  if (mode === "closed") {
    return (
      <button
        onClick={() => setMode("input")}
        className="w-full border border-dashed border-zinc-700 rounded-lg py-3 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500"
      >
        Import from calendar
      </button>
    );
  }

  if (mode === "review") {
    return (
      <div className="bg-surface-raised rounded-lg p-4">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">
          Review parsed tasks ({selected.size}/{parsed.length} selected)
        </h3>
        <div className="space-y-2 mb-4">
          {parsed.map((t, i) => (
            <label
              key={i}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => toggleSelect(i)}
                className="accent-gold"
              />
              <span className="text-xs text-zinc-500">[{t.category}]</span>
              <span>{t.title}</span>
              <span className="text-zinc-500 ml-auto">{t.est_min}m</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAddSelected}
            disabled={selected.size === 0}
            className="bg-gold text-zinc-950 font-semibold px-4 py-2 rounded hover:bg-gold-dim disabled:opacity-40"
          >
            Add {selected.size} tasks
          </button>
          <button
            onClick={() => { setMode("closed"); setParsed([]); }}
            className="text-zinc-500 hover:text-zinc-300 px-4 py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-raised rounded-lg p-4 space-y-3">
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="bg-zinc-700 hover:bg-zinc-600 px-4 py-2 rounded text-sm"
        >
          {loading ? "Parsing..." : "Upload screenshot"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
        />
      </div>
      <div className="text-zinc-600 text-center text-xs">or paste text</div>
      <textarea
        placeholder="Paste calendar text, schedule, or task list..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="w-full bg-surface border border-zinc-700 rounded px-3 py-2 focus:border-gold outline-none text-sm resize-none"
      />
      <div className="flex gap-2">
        <button
          onClick={() => handleParse({ text })}
          disabled={!text || loading}
          className="bg-gold text-zinc-950 font-semibold px-4 py-2 rounded hover:bg-gold-dim disabled:opacity-40"
        >
          {loading ? "Parsing..." : "Parse text"}
        </button>
        <button
          onClick={() => { setMode("closed"); setText(""); }}
          className="text-zinc-500 hover:text-zinc-300 px-4 py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
