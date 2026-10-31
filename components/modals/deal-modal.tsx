"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { StageTag } from "@/components/ui/tag";
import { DataTable, Td, Th } from "@/components/ui/table";
import { fmtDate, money, nextNo, qfmt, todayISO, when, ymd } from "@/lib/domain/format";
import { dealValue, quoteTotals } from "@/lib/domain/sales";
import { APPROVAL_QUOTE, STAGE_LABEL, STAGES, type QuoteLine } from "@/lib/domain/types";
import { useOps } from "@/components/providers/ops-provider";

export function DealModal({ id }: { id: string }) {
  const ops = useOps();
  const deal = ops.data?.deals.find((item) => item.id === id);
  const [contact, setContact] = useState(deal?.contact || "");
  const [title, setTitle] = useState(deal?.title || "");
  const [nextDate, setNextDate] = useState(deal?.nextDate || "");
  const [nextAction, setNextAction] = useState(deal?.nextAction || "");
  const [poNo, setPoNo] = useState("");
  const [showPo, setShowPo] = useState(false);
  if (!deal || !ops.data) return null;
  const customer = ops.data.customers.find((item) => item.id === deal.customerId);
  const index = STAGES.findIndex(([key]) => key === deal.stage);
  const totals = quoteTotals(deal.quote);
  const orders = ops.data.orders.filter((order) => order.dealId === deal.id);
  const needsApproval = !!deal.quote && ["lead", "quote"].includes(deal.stage) && !deal.quote.approved && (totals.sub || dealValue(deal)) > APPROVAL_QUOTE;

  function commit(patch: Partial<typeof deal>, note: string) {
    if (!deal) return;
    ops.saveDeal({ ...deal, ...patch, contact, title, nextDate, nextAction }, note);
    ops.toast("Saved");
  }

  return (
    <Modal
      wide
      title={customer?.name || "No customer"}
      eyebrow={`Sale ${deal.no}`}
      onClose={ops.closeModal}
      footer={
        <div className="flex flex-wrap gap-2">
          {deal.stage === "lead" ? <Button tone="primary" onClick={() => commit({ stage: "quote", quote: { no: nextNo(ops.data!.deals.map((item) => item.quote?.no || ""), "Q-"), date: todayISO(), valid: 30, leadTime: "", sentAt: "", terms: ops.data!.company.quoteTerms, lines: [] } }, "Quote started")}>Create quote</Button> : null}
          {deal.stage === "quote" ? <Button tone="primary" onClick={() => setShowPo(true)}>PO received</Button> : null}
          {deal.stage === "po" ? <Button tone="primary" onClick={startProduction}>Start production</Button> : null}
          {deal.stage === "production" ? <Button tone="primary" onClick={() => commit({ stage: "ready", nextAction: "Dispatch", nextDate: todayISO() }, "Ready for dispatch")}>Mark ready</Button> : null}
          {deal.stage === "ready" ? <Button tone="primary" onClick={dispatch}>Dispatch & create delivery docket</Button> : null}
          {["lead", "quote"].includes(deal.stage) ? <Button tone="danger" onClick={() => commit({ stage: "lost", lostReason: "Marked lost" }, "Marked lost")}>Mark lost</Button> : null}
          <span className="flex-1" />
          <Button onClick={() => commit({}, "Details updated")}>Save details</Button>
          <Button onClick={ops.closeModal}>Close</Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <StageTag stage={deal.stage} />
        <span>{deal.title}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {STAGES.filter(([key]) => key !== "lost").map(([key, label], step) => (
          <span key={key} className={`rounded-full border px-2 py-0.5 text-xs ${deal.stage === "lost" ? "border-line bg-sunk text-muted" : step < index ? "border-transparent bg-ok-soft text-ok" : step === index ? "border-transparent bg-accent font-semibold text-accent-ink" : "border-line bg-sunk text-muted"}`}>{label}</span>
        ))}
      </div>
      {needsApproval ? <div className="rounded-app bg-rev-soft px-2.5 py-2 text-[13px] text-rev">This quote is over $20,000 ex GST and needs a Director before it is sent. <Button size="sm" onClick={() => deal.quote && commit({ quote: { ...deal.quote, approved: true } }, "Director approved the quote")}>Approve</Button></div> : null}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
        <Field label="Contact"><TextInput value={contact} onChange={(event) => setContact(event.target.value)} /></Field>
        <Field label="Owner"><TextInput value={deal.owner} readOnly /></Field>
        <Field label="Next action date"><TextInput type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} /></Field>
        <Field label="Next action"><TextInput value={nextAction} onChange={(event) => setNextAction(event.target.value)} /></Field>
        <Field label="What they need" className="col-span-full"><TextInput value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      </div>
      {deal.quote ? (
        <section className="grid gap-2.5 border-t border-line pt-3">
          <h3 className="m-0 font-display text-[19px] font-semibold">Quote <span className="font-mono">{deal.quote.no}</span></h3>
          <DataTable>
            <thead><tr><Th>Item code</Th><Th>Description</Th><Th numeric>Qty</Th><Th numeric>Unit price</Th><Th numeric>Line total</Th></tr></thead>
            <tbody>
              {deal.quote.lines.map((line, lineIndex) => (
                <tr key={lineIndex}>
                  <Td className="font-mono">{line.code}</Td>
                  <Td>{line.desc}</Td>
                  <Td numeric>{qfmt(line.qty)}</Td>
                  <Td numeric>{money(line.price)}</Td>
                  <Td numeric>{money(line.qty * line.price * (1 - line.disc / 100))}</Td>
                </tr>
              ))}
              {!deal.quote.lines.length ? <tr><Td className="text-muted">No lines yet. Add an item code below.</Td></tr> : null}
            </tbody>
          </DataTable>
          <div className="text-right text-[13px]">Subtotal {money(totals.sub)} · GST {money(totals.gst)} · <strong>Total {money(totals.total)}</strong></div>
          {["lead", "quote"].includes(deal.stage) ? <QuoteAdder dealId={deal.id} /> : null}
          <Field label="Terms & notes on the quote"><TextArea rows={2} defaultValue={deal.quote.terms} onBlur={(event) => deal.quote && ops.saveDeal({ ...deal, quote: { ...deal.quote, terms: event.target.value } })} /></Field>
        </section>
      ) : null}
      {deal.po ? (
        <section className="grid gap-2 border-t border-line pt-3">
          <h3 className="m-0 font-display text-[19px] font-semibold">Purchase order</h3>
          <div className="grid grid-cols-2 gap-2 text-sm min-[700px]:grid-cols-4">
            <div><div className="text-[11px] uppercase tracking-[0.06em] text-muted">PO number</div><div className="font-mono font-medium">{deal.po.no}</div></div>
            <div><div className="text-[11px] uppercase tracking-[0.06em] text-muted">Received</div><div>{fmtDate(deal.po.date)}</div></div>
            <div><div className="text-[11px] uppercase tracking-[0.06em] text-muted">PO value ex GST</div><div>{money(deal.po.value)}</div></div>
            <div><div className="text-[11px] uppercase tracking-[0.06em] text-muted">Required by</div><div>{fmtDate(deal.po.required)}</div></div>
          </div>
        </section>
      ) : null}
      {showPo ? (
        <section className="grid gap-2 rounded-app border border-accent p-3">
          <h3 className="m-0 font-display text-[19px] font-semibold">PO received</h3>
          <Field label="PO number *"><TextInput className="font-mono" value={poNo} onChange={(event) => setPoNo(event.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setShowPo(false)}>Cancel</Button>
            <Button tone="primary" onClick={() => {
              if (!poNo.trim()) return;
              commit({ stage: "po", po: { no: poNo.trim(), date: todayISO(), value: totals.sub || deal.value, required: ymd(21) }, nextAction: "Start production", nextDate: todayISO() }, `PO ${poNo.trim()} received`);
              setShowPo(false);
            }}>Confirm</Button>
          </div>
        </section>
      ) : null}
      {orders.length ? (
        <section className="grid gap-2 border-t border-line pt-3">
          <h3 className="m-0 font-display text-[19px] font-semibold">Build orders</h3>
          <DataTable>
            <thead><tr><Th>Order</Th><Th>Item</Th><Th numeric>Qty</Th><Th>Status</Th></tr></thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <Td className="font-mono">{order.no}</Td>
                  <Td className="font-mono">{ops.partMap.get(order.itemId)?.partNo}</Td>
                  <Td numeric>{qfmt(order.qty)}</Td>
                  <Td>{order.status}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </section>
      ) : null}
      {deal.dockets.length ? (
        <section className="grid gap-2 border-t border-line pt-3">
          <h3 className="m-0 font-display text-[19px] font-semibold">Delivery dockets</h3>
          {deal.dockets.map((docket) => (
            <div key={docket.docketNo} className="grid gap-1 rounded-app border border-line bg-sunk px-3 py-2.5">
              <strong className="font-mono">{docket.docketNo}</strong>
              <span className="text-[12.5px] text-muted">{fmtDate(docket.date)} · {docket.carrier} {docket.connote ? `· Con ${docket.connote}` : ""} · {docket.address}</span>
            </div>
          ))}
        </section>
      ) : null}
      {deal.invoices.length ? (
        <section className="grid gap-2 border-t border-line pt-3">
          <h3 className="m-0 font-display text-[19px] font-semibold">Tax invoices</h3>
          <DataTable>
            <thead><tr><Th>Invoice</Th><Th>Date</Th><Th numeric>Total inc GST</Th><Th>Due</Th><Th>Status</Th></tr></thead>
            <tbody>
              {deal.invoices.map((invoice) => (
                <tr key={invoice.no}>
                  <Td className="font-mono">{invoice.no}</Td>
                  <Td className="text-muted">{fmtDate(invoice.date)}</Td>
                  <Td numeric>{money(invoice.amount)}</Td>
                  <Td className={!invoice.paid && invoice.due < todayISO() ? "text-bad" : "text-muted"}>{fmtDate(invoice.due)}</Td>
                  <Td>{invoice.paid ? <span className="rounded-[3px] bg-ok-soft px-1.5 py-px text-[11px] font-semibold text-ok uppercase">Paid {fmtDate(invoice.paidAt)}</span> : <span className="rounded-[3px] bg-rev-soft px-1.5 py-px text-[11px] font-semibold text-rev uppercase">Unpaid</span>}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </section>
      ) : null}
      <details>
        <summary className="cursor-pointer text-[12.5px] text-muted">Activity ({deal.history.length})</summary>
        <DataTable>
          <tbody>
            {deal.history.map((entry, entryIndex) => (
              <tr key={entryIndex}><Td className="text-muted whitespace-nowrap">{when(entry.at)}</Td><Td>{entry.note}</Td></tr>
            ))}
          </tbody>
        </DataTable>
      </details>
      <p className="m-0 text-[12.5px] text-muted">Stage: {STAGE_LABEL[deal.stage]}</p>
    </Modal>
  );

  function startProduction() {
    if (!deal?.quote?.lines.length) return;
    const line = deal.quote.lines.find((item) => item.itemId);
    if (!line?.itemId || !ops.data) return;
    const no = nextNo(ops.data.orders.map((order) => order.no), "MO-");
    ops.saveOrder({
      id: no,
      no,
      itemId: line.itemId,
      qty: line.qty,
      sell: line.price,
      customer: customer?.name || "",
      ref: deal.po?.no || "",
      due: deal.po?.required || "",
      notes: `From ${deal.no}`,
      status: "open",
      dealId: deal.id,
      createdAt: new Date().toISOString(),
    });
    commit({ stage: "production", nextAction: `Build ${no}`, nextDate: deal.po?.required || todayISO() }, `Production started: ${no}`);
  }

  function dispatch() {
    if (!deal?.quote) return;
    const docketNo = nextNo(ops.data!.deals.flatMap((item) => item.dockets.map((docket) => docket.docketNo)), "DD-");
    const lines: QuoteLine[] = deal.quote.lines;
    commit({
      stage: "dispatched",
      nextAction: `Invoice ${docketNo}`,
      nextDate: todayISO(),
      dockets: [...deal.dockets, {
        docketNo,
        date: todayISO(),
        carrier: "Toll",
        connote: "",
        packages: "",
        weight: "",
        address: customer?.site || customer?.address || "",
        attn: deal.contact,
        backOrder: deal.dockets.length > 0,
        lines: lines.map((line, lineIndex) => ({ li: lineIndex, itemId: line.itemId, code: line.code, desc: line.desc, ordered: line.qty, supplied: line.qty, price: line.price, disc: line.disc })),
      }],
    }, `Dispatched on docket ${docketNo}`);
  }
}

function QuoteAdder({ dealId }: { dealId: string }) {
  const ops = useOps();
  const [code, setCode] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Add item code"><TextInput className="font-mono" value={code} onChange={(event) => setCode(event.target.value)} /></Field>
      <Button onClick={() => {
        const deal = ops.data?.deals.find((item) => item.id === dealId);
        const found = ops.findByNo(code);
        const part = found ? ops.partMap.get(found) : undefined;
        if (!deal?.quote || !part) { ops.toast("No item with that code."); return; }
        const sell = ops.data?.prices[part.id]?.sell || 0;
        ops.saveDeal({
          ...deal,
          quote: { ...deal.quote, lines: [...deal.quote.lines, { itemId: part.id, code: part.partNo, desc: part.description, qty: 1, price: sell, disc: 0 }] },
        });
        setCode("");
      }}>+ Add line</Button>
    </div>
  );
}
