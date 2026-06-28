import { multiplierColor } from "../logic";

export function TruthPanel({
  multiplier,
  streak,
  gateOpen,
}: {
  multiplier: number;
  streak: number;
  gateOpen: boolean;
}) {
  return (
    <div className="bg-surface-raised rounded-xl p-6">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-zinc-400 text-sm uppercase tracking-wider">
          Estimate Accuracy
        </span>
        <span className="text-zinc-500 text-sm">
          {streak > 0 ? `${streak}-day streak` : "No streak"}
        </span>
      </div>
      <div className={`text-5xl font-bold tabular-nums ${multiplierColor(multiplier)}`}>
        {multiplier.toFixed(2)}x
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            gateOpen ? "bg-money" : "bg-red-500"
          }`}
        />
        <span className="text-zinc-400">
          {gateOpen ? "Gate open — creative unlocked" : "Gate locked — finish a money task"}
        </span>
      </div>
    </div>
  );
}
