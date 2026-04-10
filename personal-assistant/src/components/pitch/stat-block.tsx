interface StatBlockProps {
  value: string;
  label: string;
  source?: string;
}

export function StatBlock({ value, label, source }: StatBlockProps) {
  return (
    <div className="text-center">
      <div className="text-4xl font-semibold tracking-tight text-zinc-900 md:text-5xl">
        {value}
      </div>
      <div className="mt-1 text-sm text-zinc-500">{label}</div>
      {source && (
        <div className="mt-0.5 text-xs text-zinc-400">{source}</div>
      )}
    </div>
  );
}
