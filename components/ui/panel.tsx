export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-app border border-line bg-surface ${className}`}>{children}</section>;
}

export function EmptyState({ title, children }: { title?: string; children?: React.ReactNode }) {
  return (
    <div className="px-4 py-7 text-center text-muted">
      {title ? <strong className="mb-1 block font-display text-xl font-semibold text-ink">{title}</strong> : null}
      {children}
    </div>
  );
}

export function Note({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[12.5px] text-muted ${className}`}>{children}</p>;
}

export function PageHead({
  eyebrow,
  title,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[13px] text-muted">{eyebrow}</div>
          <h1 className="m-0 text-balance font-display text-[30px] font-semibold leading-[1.05]">{title}</h1>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Tiles({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">{children}</div>;
}

export function Tile({ label, value, note, warn }: { label: string; value: React.ReactNode; note?: React.ReactNode; warn?: boolean }) {
  return (
    <div className="rounded-app border border-line bg-sunk px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className={`font-display text-[26px] font-semibold tabular-nums ${warn ? "text-bad" : ""}`}>{value}</div>
      {note ? <div className="text-[12.5px] font-normal text-muted">{note}</div> : null}
    </div>
  );
}

export function Kv({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-2.5">{children}</dl>;
}

export function KvItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="m-0 text-[11px] uppercase tracking-[0.06em] text-muted">{label}</dt>
      <dd className="m-0 mt-0.5 font-medium wrap-break-word">{children}</dd>
    </div>
  );
}
