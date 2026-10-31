export function DataTable({ children, className = "", maxHeight }: { children: React.ReactNode; className?: string; maxHeight?: string }) {
  return (
    <div className={`overflow-x-auto rounded-app border border-line ${className}`} style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}

export function Th({ children, numeric, className = "" }: { children?: React.ReactNode; numeric?: boolean; className?: string }) {
  return (
    <th className={`whitespace-nowrap border-b border-line bg-sunk px-2.5 py-[7px] text-[11px] font-semibold uppercase tracking-[0.06em] text-muted ${numeric ? "text-right" : "text-left"} ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, numeric, className = "" }: { children?: React.ReactNode; numeric?: boolean; className?: string }) {
  return <td className={`border-b border-line px-2.5 py-1.5 align-middle ${numeric ? "text-right whitespace-nowrap tabular-nums" : ""} ${className}`}>{children}</td>;
}
