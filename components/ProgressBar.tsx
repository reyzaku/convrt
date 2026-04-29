'use client';

interface ProgressBarProps {
  progress: number;
  label?: string;
}

export default function ProgressBar({ progress, label }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));

  return (
    <div className="w-full space-y-1">
      {label && (
        <div className="flex justify-between text-sm text-zinc-400">
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #E85D20, #ff8c57)',
          }}
        />
      </div>
    </div>
  );
}
