"use client";

import { TextButton } from "@/components/ui/button";
import { DataTable, Td, Th } from "@/components/ui/table";
import { StageTag, StatusTag } from "@/components/ui/tag";
import type { AttentionItem } from "@/lib/domain/types";
import { useOps } from "@/components/providers/ops-provider";

const SEVERITY: Record<AttentionItem["severity"], [string, string]> = {
  approval: ["Approval", "bg-accent-soft text-accent"],
  overdue: ["Overdue", "bg-bad-soft text-bad"],
  due: ["Due", "bg-rev-soft text-rev"],
};

export function AttentionTable({ items }: { items: AttentionItem[] }) {
  const ops = useOps();
  if (!items.length) {
    return (
      <div className="px-4 py-7 text-center text-muted">
        <strong className="mb-1 block font-display text-xl font-semibold text-ink">Nothing needs attention</strong>
        Sales, approvals, builds, RFQs and supplier deliveries are all on track.
      </div>
    );
  }
  const ownerName = (email: string) => ops.data?.users.find((user) => user.email === email)?.name || email || "—";
  return (
    <DataTable>
      <thead>
        <tr>
          <Th />
          <Th>What</Th>
          <Th>Record</Th>
          <Th>Detail</Th>
          <Th>Owner</Th>
          <Th numeric>Days</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.key}>
            <Td>
              <span className={`inline-block rounded-[3px] px-1.5 py-px text-[11px] font-semibold uppercase ${SEVERITY[item.severity][1]}`}>{SEVERITY[item.severity][0]}</span>
              {item.escalate ? <span className="ml-1 inline-block rounded-[3px] bg-bad-soft px-1.5 py-px text-[11px] font-semibold text-bad uppercase">Escalated</span> : null}
            </Td>
            <Td><strong>{item.label}</strong></Td>
            <Td>
              <TextButton className="font-mono" onClick={() => openAttention(ops, item)}>{item.title}</TextButton>
            </Td>
            <Td className="text-[12.5px] text-muted">{item.detail}</Td>
            <Td className="text-[12.5px] text-muted">{item.severity === "approval" ? "Director" : ownerName(item.owner)}</Td>
            <Td numeric>{item.age || ""}</Td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

export function dealFlag(items: AttentionItem[], id: string) {
  const item = items.find((entry) => entry.coll === "deals" && entry.id === id);
  if (!item) return null;
  return (
    <div className="text-[12.5px] text-muted">
      <span className={`inline-block rounded-[3px] px-1.5 py-px text-[11px] font-semibold uppercase ${SEVERITY[item.severity][1]}`}>⚑ {item.label}</span>
    </div>
  );
}

function openAttention(ops: ReturnType<typeof useOps>, item: AttentionItem) {
  ops.closeModal();
  if (item.coll === "deals") {
    ops.setView("sales");
    ops.openModal({ type: "deal", id: item.id });
  } else if (item.coll === "pos") {
    ops.setView("purchasing");
    ops.setPurchTab("open");
    ops.openModal({ type: "po", id: item.id });
  } else if (item.coll === "rfqs") {
    ops.setView("purchasing");
    ops.setPurchTab("rfqs");
  } else if (item.coll === "orders") {
    ops.setView("orders");
    ops.setOrderTab("open");
    ops.setSelectedOrderId(item.id);
  }
}

export function PoTag({ status, label }: { status: string; label: string }) {
  return <StatusTag status={status} label={label} />;
}

export function Stage({ stage }: { stage: string }) {
  return <StageTag stage={stage} />;
}
