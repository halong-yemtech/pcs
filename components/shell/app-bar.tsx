"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { FULL_BLEED, VIEWS, type ViewId } from "@/lib/domain/types";
import { useOps } from "@/components/providers/ops-provider";

export function AppBar() {
  const ops = useOps();
  const approvals = ops.attention.filter((item) => item.severity === "approval").length;
  const count = ops.attention.length;
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-[5] border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3.5 px-[max(16px,env(safe-area-inset-left))] py-2.5 pr-[max(16px,env(safe-area-inset-right))]">
        <div className="flex items-center gap-2 font-display text-[22px] font-bold uppercase tracking-[0.02em]">
          <Image src="/logo.png" alt="PCS" width={34} height={35} className="rounded-full bg-white" />
          <span>PCS</span>
          <span className="font-sans text-[13px] font-medium normal-case tracking-normal text-muted">BOM Register</span>
        </div>
        <nav className="flex flex-wrap gap-0.5 rounded-app border border-line bg-sunk p-0.5" aria-label="View">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={ops.view === item.id}
              onClick={() => ops.setView(item.id as ViewId)}
              className={`cursor-pointer rounded px-3 py-[5px] font-medium ${
                ops.view === item.id ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "bg-transparent text-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <span className="flex-1" />
        <span className="max-w-[200px] truncate text-[12.5px] text-muted">{ops.status}</span>
        <Button className="relative px-2.5" aria-label="Needs attention" title={count ? `${count} need attention` : "Nothing needs attention"} onClick={() => ops.openModal({ type: "attention" })}>
          <span aria-hidden>🔔</span>
          <span className="sr-only">Needs attention</span>
          {count ? (
            <span className={`absolute -top-[7px] -right-[7px] h-[18px] min-w-[18px] rounded-[9px] px-[5px] text-center text-[11px] leading-[18px] font-semibold text-white ${approvals ? "bg-accent" : "bg-bad"}`}>
              {count}
            </span>
          ) : null}
        </Button>
        <Button title="Company details for quotes and POs" onClick={() => ops.openModal({ type: "company" })}>
          Company
        </Button>
        <Button tone="primary" onClick={() => ops.openModal({ type: "item" })}>
          + New item
        </Button>
      </div>
    </header>
  );
}

export function isFullBleed(view: ViewId) {
  return FULL_BLEED.includes(view);
}
