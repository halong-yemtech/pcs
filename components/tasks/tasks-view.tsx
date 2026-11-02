"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState, PageHead, Panel } from "@/components/ui/panel";
import { openAttention } from "@/components/attention/attention-table";
import { taskAction } from "@/lib/domain/attention";
import { fmtDate, money, todayISO } from "@/lib/domain/format";
import { dealValue } from "@/lib/domain/sales";
import { STAGES, type AttentionItem } from "@/lib/domain/types";
import { useOps } from "@/components/providers/ops-provider";

export function TasksView() {
  const ops = useOps();
  const [dismissKey, setDismissKey] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  if (!ops.data) return <Panel><EmptyState>Loading…</EmptyState></Panel>;
  const mine = ops.taskTab === "mine";
  const items = mine ? ops.mineAttention : ops.attention;
  const approvals = items.filter((item) => item.severity === "approval");
  const overdue = items.filter((item) => item.severity === "overdue");
  const due = items.filter((item) => item.severity === "due");
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = (ops.me?.name || "").split(" ")[0];
  const open = ops.data.deals.filter((deal) => !["closed", "lost"].includes(deal.stage));
  const pipeline = open.reduce((sum, deal) => sum + dealValue(deal), 0);
  const stuck = (stage: string) => new Set(ops.attention.filter((item) => item.coll === "deals" && ops.data?.deals.find((deal) => deal.id === item.id)?.stage === stage).map((item) => item.id)).size;

  return (
    <Panel>
      <PageHead
        eyebrow={`${fmtDate(todayISO())} · from the rules that keep the pipeline moving`}
        title={`${hello}${first ? `, ${first}` : ""}`}
        actions={ops.me?.role === "admin" ? <Button onClick={() => ops.openModal({ type: "rules" })}>Rules & limits</Button> : null}
      >
        <p className="m-0 text-[15px]">
          {items.length ? (
            <>
              <strong>{items.length} task{items.length === 1 ? "" : "s"}</strong> need{items.length === 1 ? "s" : ""} {mine ? "you" : "attention"}
              {approvals.length ? ` · ${approvals.length} approval${approvals.length === 1 ? "" : "s"} waiting` : ""}
              {overdue.length ? ` · ${overdue.length} overdue` : ""}.
            </>
          ) : "Nothing needs you right now. The pipeline is moving."}
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
          <CountTile label="Approvals" value={approvals.length} note={ops.approver ? "waiting for you" : "waiting on a Director"} onClick={() => scrollTo("tk-approval")} />
          <CountTile label="Overdue" value={overdue.length} note="past the limit" warn={overdue.length > 0} onClick={() => scrollTo("tk-overdue")} />
          <CountTile label="Coming up" value={due.length} note="due soon" onClick={() => scrollTo("tk-due")} />
          <CountTile label="Open pipeline" value={money(pipeline)} note={`${open.length} sale${open.length === 1 ? "" : "s"}`} onClick={() => ops.setView("sales")} />
        </div>
        <ChipRow>
          <Chip pressed={mine} onClick={() => ops.setTaskTab("mine")}>My tasks ({ops.mineAttention.length})</Chip>
          <Chip pressed={!mine} onClick={() => ops.setTaskTab("all")}>Everyone ({ops.attention.length})</Chip>
        </ChipRow>
      </PageHead>
      <div className="grid gap-2 px-4 pb-4">
        {ops.backup?.overdue && ops.me?.role === "admin" ? (
          <article className="flex flex-wrap items-center justify-between gap-3.5 rounded-[10px] border border-line border-l-4 border-l-bad bg-surface px-3.5 py-3">
            <div>
              <span className="inline-block rounded-[3px] bg-bad-soft px-1.5 py-px text-[11px] font-semibold text-bad uppercase">Backup</span>
              <div className="mt-1 font-semibold">{ops.backup.lastOk ? "No backup for over a week" : "The system has never been backed up"}</div>
              <div className="text-[12.5px] text-muted">{ops.backup.targets.length ? "The weekly backup has not completed. Check the backup history and run one now." : "No off-site backup destination is set up yet."}</div>
            </div>
            <Button tone="primary" onClick={() => ops.openModal({ type: "backups" })}>Check backups →</Button>
          </article>
        ) : null}
        {items.length ? (
          <>
            <TaskGroup id="tk-approval" title="Approvals" items={approvals} dismissKey={dismissKey} reason={reason} setDismissKey={setDismissKey} setReason={setReason} />
            <TaskGroup id="tk-overdue" title="Overdue" items={overdue} dismissKey={dismissKey} reason={reason} setDismissKey={setDismissKey} setReason={setReason} />
            <TaskGroup id="tk-due" title="Coming up" items={due} dismissKey={dismissKey} reason={reason} setDismissKey={setDismissKey} setReason={setReason} />
          </>
        ) : (
          <EmptyState title="All clear ✓">New tasks appear here as soon as a sale, build, supplier or payment goes past its limit.</EmptyState>
        )}
        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
          {STAGES.filter(([key]) => key !== "closed" && key !== "lost").map(([key, label]) => {
            const count = open.filter((deal) => deal.stage === key).length;
            const held = stuck(key);
            return (
              <button key={key} type="button" onClick={() => ops.setView("sales")} className="grid gap-0.5 rounded-lg border border-line bg-sunk px-2.5 py-2 text-left">
                <span className="text-[12.5px] text-muted">{label}</span>
                <strong className="font-display text-lg">{count}</strong>
                {held ? <span className="w-fit rounded-[3px] bg-bad-soft px-1.5 py-px text-[11px] font-semibold text-bad uppercase">{held} stuck</span> : <span className="text-[12.5px] text-muted">on track</span>}
              </button>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function CountTile({ label, value, note, warn, onClick }: { label: string; value: ReactNode; note: string; warn?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-app border border-line bg-sunk px-3 py-2.5 text-left hover:border-accent">
      <div className="text-[11px] uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className={`font-display text-[26px] font-semibold tabular-nums ${warn ? "text-bad" : ""}`}>{value}</div>
      <div className="text-[12.5px] text-muted">{note}</div>
    </button>
  );
}

function TaskGroup({ id, title, items, dismissKey, reason, setDismissKey, setReason }: {
  id: string;
  title: string;
  items: AttentionItem[];
  dismissKey: string | null;
  reason: string;
  setDismissKey: (key: string | null) => void;
  setReason: (value: string) => void;
}) {
  const ops = useOps();
  if (!items.length) return <div id={id} />;
  return (
    <div id={id}>
      <h2 className="mt-4 mb-2 font-display text-[19px] font-semibold">{title} <span className="text-[13px] font-normal text-muted">{items.length}</span></h2>
      <div className="grid gap-2">
        {items.map((item) => {
          const deal = item.coll === "deals" ? ops.data?.deals.find((entry) => entry.id === item.id) : undefined;
          const border = item.severity === "approval" ? "border-l-accent" : item.severity === "overdue" ? "border-l-bad" : "border-l-rev";
          const tag = item.severity === "approval" ? "bg-accent-soft text-accent" : item.severity === "overdue" ? "bg-bad-soft text-bad" : "bg-rev-soft text-rev";
          return (
            <article key={item.key} className={`flex flex-wrap items-center justify-between gap-3.5 rounded-[10px] border border-line border-l-4 bg-surface px-3.5 py-3 ${border}`}>
              <div className="min-w-[260px] flex-1">
                <div>
                  <span className={`inline-block rounded-[3px] px-1.5 py-px text-[11px] font-semibold uppercase ${tag}`}>{item.label}</span>
                  {item.escalate ? <span className="ml-1 inline-block rounded-[3px] bg-bad-soft px-1.5 py-px text-[11px] font-semibold text-bad uppercase">Escalated</span> : null}
                  {item.age ? <span className="text-[12.5px] text-muted"> · {item.age} day{item.age === 1 ? "" : "s"}</span> : null}
                </div>
                <div className="mt-0.5 font-semibold">{item.title}</div>
                <div className="text-[12.5px] text-muted">
                  {item.detail}
                  {item.severity !== "approval" && ops.taskTab === "all" && item.owner ? ` · ${ops.data?.users.find((user) => user.email === item.owner)?.name || item.owner}` : ""}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button tone="primary" onClick={() => openAttention(ops, item)}>{taskAction(item, deal?.nextAction, ops.approver)} →</Button>
                {dismissKey === item.key ? (
                  <>
                    <input className="w-[200px] rounded-app border border-line bg-sunk px-2 py-1" placeholder="Reason (e.g. customer on leave)" value={reason} onChange={(event) => setReason(event.target.value)} />
                    <Button size="sm" tone="primary" onClick={() => { ops.dismissAttention(item.key, reason.trim()); setDismissKey(null); setReason(""); }}>Dismiss</Button>
                  </>
                ) : (
                  <>
                    <select className="rounded-app border border-line bg-sunk px-2 py-1" aria-label="Snooze" value="" onChange={(event) => { if (event.target.value) ops.snoozeAttention(item.key, Number(event.target.value)); }}>
                      <option value="">Snooze…</option>
                      <option value="1">Tomorrow</option>
                      <option value="3">3 days</option>
                      <option value="7">1 week</option>
                    </select>
                    <Button size="sm" onClick={() => { setDismissKey(item.key); setReason(""); }}>Dismiss</Button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
