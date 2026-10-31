import { STAGE_LABEL } from "@/lib/domain/types";

const base = "inline-block whitespace-nowrap rounded-[3px] border border-transparent px-1.5 py-px text-[11px] font-semibold uppercase tracking-[0.04em]";

export function Tag({ className = "", title, children }: { className?: string; title?: string; children: React.ReactNode }) {
  return <span title={title} className={`${base} border-line bg-sunk text-muted ${className}`}>{children}</span>;
}

const LEVEL: Record<string, string> = {
  Product: "border-transparent bg-accent text-accent-ink",
  Part: "border-transparent bg-accent-soft text-accent",
  Component: "border-transparent bg-ok-soft text-ok",
  Item: "border-line bg-sunk text-muted",
};

export function LevelTag({ level }: { level?: string }) {
  if (!level) return <Tag title="No level set">—</Tag>;
  return <span className={`${base} ${LEVEL[level] || "border-line bg-sunk text-muted"}`}>{level}</span>;
}

const STAGE: Record<string, string> = {
  lead: "border-line bg-sunk text-muted",
  quote: "bg-accent-soft text-accent",
  po: "bg-rev-soft text-rev",
  production: "bg-rev-soft text-rev",
  ready: "bg-rev-soft text-rev",
  dispatched: "bg-ok-soft text-ok",
  invoiced: "bg-ok-soft text-ok",
  closed: "bg-ok text-white",
  lost: "bg-bad-soft text-bad",
};

export function StageTag({ stage }: { stage: string }) {
  return <span className={`${base} ${STAGE[stage] || "border-line bg-sunk text-muted"}`}>{STAGE_LABEL[stage] || stage}</span>;
}

export function StockTag({ status }: { status: "" | "ok" | "low" | "out" }) {
  if (status === "out") return <span className={`${base} bg-bad-soft text-bad`}>Out</span>;
  if (status === "low") return <span className={`${base} bg-rev-soft text-rev`}>Low</span>;
  if (status === "ok") return <span className={`${base} bg-ok-soft text-ok`}>OK</span>;
  return <span className="text-muted">—</span>;
}

const PO: Record<string, string> = {
  draft: "border-line bg-sunk text-muted",
  sent: "bg-accent-soft text-accent",
  part: "bg-rev-soft text-rev",
  received: "bg-ok-soft text-ok",
  cancelled: "bg-bad-soft text-bad",
  quoted: "bg-rev-soft text-rev",
  ordered: "bg-ok-soft text-ok",
};

export function StatusTag({ status, label }: { status: string; label: string }) {
  return <span className={`${base} ${PO[status] || "border-line bg-sunk text-muted"}`}>{label}</span>;
}

export function TempTag() {
  return <span className={`${base} bg-rev-soft text-rev`}>Temp code</span>;
}
