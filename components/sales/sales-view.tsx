"use client";

import { AttentionTable, dealFlag } from "@/components/attention/attention-table";
import { Button, TextButton } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { SearchInput, SelectInput } from "@/components/ui/field";
import { EmptyState, Note, PageHead, Panel, Tile, Tiles } from "@/components/ui/panel";
import { StageTag } from "@/components/ui/tag";
import { DataTable, Td, Th } from "@/components/ui/table";
import { downloadCsv } from "@/lib/domain/download";
import { fmtDate, fyOf, money, todayISO } from "@/lib/domain/format";
import { dealValue, hasBackOrder, HIST_DAYS, invoicedTotal, isHistoric, leadToPaidDays, unpaid, uninvoiced } from "@/lib/domain/sales";
import { STAGES, type Deal } from "@/lib/domain/types";
import { useOps } from "@/components/providers/ops-provider";

export function SalesView() {
  const ops = useOps();
  if (!ops.data) return <Panel><EmptyState>Loading…</EmptyState></Panel>;
  const data = ops.data;
  const today = todayISO();
  const month = today.slice(0, 7);
  const open = data.deals.filter((deal) => !["closed", "lost"].includes(deal.stage));
  const quotesOut = data.deals.filter((deal) => deal.stage === "quote").reduce((sum, deal) => sum + dealValue(deal), 0);
  const poMonth = data.deals.filter((deal) => (deal.po?.date || "").startsWith(month)).reduce((sum, deal) => sum + (deal.po?.value || dealValue(deal)), 0);
  const invoices = data.deals.flatMap((deal) => deal.invoices);
  const invoicedMonth = invoices.filter((invoice) => invoice.date.startsWith(month)).reduce((sum, invoice) => sum + invoice.amount, 0);
  const owing = data.deals.reduce((sum, deal) => sum + unpaid(deal), 0);
  const query = ops.salesQuery.toLowerCase();
  const match = (deal: Deal) => {
    if (!query) return true;
    const customer = ops.customerName(deal.customerId);
    const haystack = [deal.no, deal.title, customer, deal.contact, deal.quote?.no, deal.po?.no, ...deal.dockets.map((docket) => docket.docketNo), ...deal.invoices.map((invoice) => invoice.no)].join(" ").toLowerCase();
    return haystack.includes(query);
  };
  const historic = data.deals.filter((deal) => isHistoric(deal, today));
  const years = [...new Set(historic.map((deal) => fyOf(deal.closedAt)).filter((year): year is number => year != null))].sort((a, b) => b - a);

  return (
    <Panel>
      <PageHead
        eyebrow="One sale number from lead to payment: lead → quote → PO → production → dispatch → invoice → closed"
        title="Sales"
        actions={
          <>
            {ops.salesTab === "customers" ? (
              <Button tone="primary" onClick={() => ops.openModal({ type: "customer" })}>+ New customer</Button>
            ) : (
              <Button tone="primary" onClick={() => ops.openModal({ type: "lead" })}>+ New lead</Button>
            )}
            <Button onClick={() => exportDeals(ops)}>Export</Button>
          </>
        }
      >
        <Tiles>
          <Tile label="Open pipeline" value={money(open.reduce((sum, deal) => sum + dealValue(deal), 0))} note={`${open.length} deal${open.length === 1 ? "" : "s"} · ex GST`} />
          <Tile label="Quotes out" value={money(quotesOut)} />
          <Tile label="POs received this month" value={money(poMonth)} />
          <Tile label="Invoiced this month" value={money(invoicedMonth)} note={`${money(owing)} unpaid`} />
        </Tiles>
        <div className="flex flex-wrap items-center gap-2">
          <ChipRow>
            <Chip pressed={ops.salesTab === "pipeline"} onClick={() => ops.setSalesTab("pipeline")}>Pipeline</Chip>
            <Chip pressed={ops.salesTab === "list"} onClick={() => ops.setSalesTab("list")}>All deals</Chip>
            <Chip pressed={ops.salesTab === "history"} onClick={() => ops.setSalesTab("history")}>Sales history ({historic.length})</Chip>
            <Chip pressed={ops.salesTab === "attention"} onClick={() => ops.setSalesTab("attention")}>Needs attention ({ops.attention.length})</Chip>
            <Chip pressed={ops.salesTab === "customers"} onClick={() => ops.setSalesTab("customers")}>Customers ({data.customers.length})</Chip>
          </ChipRow>
          <SearchInput className="max-w-[320px]" placeholder="Search sale, customer, quote, PO, docket or invoice no." value={ops.salesQuery} onChange={(event) => ops.setSalesQuery(event.target.value)} />
          {ops.salesTab === "history" ? (
            <SelectInput className="w-auto max-w-[170px]" aria-label="Financial year" value={ops.historyFy} onChange={(event) => ops.setHistoryFy(event.target.value)}>
              <option value="all">All years</option>
              {years.map((year) => <option key={year} value={year}>FY{year} (Jul {year - 1} – Jun {year})</option>)}
            </SelectInput>
          ) : null}
          {ops.salesTab === "pipeline" ? (
            <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
              <input type="checkbox" checked={ops.showLost} onChange={(event) => ops.setShowLost(event.target.checked)} /> Show lost
            </label>
          ) : null}
        </div>
      </PageHead>
      <div className="grid gap-3.5 px-4 pt-0 pb-[18px]">
        {ops.salesTab === "attention" ? <AttentionTable items={ops.attention} /> : null}
        {ops.salesTab === "customers" ? <Customers /> : null}
        {ops.salesTab === "history" ? <History match={match} today={today} /> : null}
        {ops.salesTab === "list" ? <DealList match={match} today={today} /> : null}
        {ops.salesTab === "pipeline" ? <Pipeline match={match} today={today} /> : null}
      </div>
    </Panel>
  );
}

function Pipeline({ match, today }: { match: (deal: Deal) => boolean; today: string }) {
  const ops = useOps();
  const columns = STAGES.filter(([key]) => key !== "lost" || ops.showLost);
  return (
    <div className="grid auto-cols-[minmax(190px,1fr)] grid-flow-col gap-2.5 overflow-x-auto pb-1.5">
      {columns.map(([key, label]) => {
        const deals = (ops.data?.deals || [])
          .filter((deal) => deal.stage === key && match(deal) && (key !== "closed" || !isHistoric(deal, today)))
          .sort((a, b) => String(a.nextDate || "9").localeCompare(String(b.nextDate || "9")));
        const total = deals.reduce((sum, deal) => sum + dealValue(deal), 0);
        return (
          <div key={key} className="grid min-h-[120px] content-start gap-2 rounded-app border border-line bg-sunk p-2">
            <div className="flex justify-between gap-1.5 text-[12.5px] font-semibold uppercase tracking-[0.05em]">
              <span>{label}</span>
              <span className="font-normal text-muted normal-case tracking-normal">{deals.length} · {money(total)}</span>
            </div>
            {deals.map((deal) => {
              const due = deal.nextDate && deal.nextDate < today;
              const orders = (ops.data?.orders || []).filter((order) => order.dealId === deal.id);
              return (
                <button key={deal.id} type="button" onClick={() => ops.openModal({ type: "deal", id: deal.id })} className="grid w-full gap-0.5 rounded-app border border-line bg-surface px-2.5 py-2 text-left hover:border-accent">
                  <div className="flex justify-between gap-1.5">
                    <span className="font-mono text-[12.5px] text-muted">{deal.no}</span>
                    <strong>{money(dealValue(deal))}</strong>
                  </div>
                  <div className="font-semibold">{ops.customerName(deal.customerId) || "No customer"}</div>
                  <div className="text-[12.5px] text-muted">{deal.title}</div>
                  {dealFlag(ops.attention, deal.id)}
                  {deal.nextAction || deal.nextDate ? (
                    <div className={`text-[12.5px] ${due ? "text-bad" : "text-muted"}`}>{deal.nextDate ? `${fmtDate(deal.nextDate)} · ` : ""}{deal.nextAction}</div>
                  ) : null}
                  {key === "production" ? <div className="text-[12.5px] text-muted">{orders.filter((order) => order.status !== "open").length}/{orders.length} built</div> : null}
                  {deal.dockets.length && hasBackOrder(deal) ? <div className="text-[12.5px]"><span className="rounded-[3px] bg-rev-soft px-1.5 py-px text-[11px] font-semibold text-rev uppercase">Back order</span></div> : null}
                  {uninvoiced(deal).length ? <div className="text-[12.5px] text-muted">{uninvoiced(deal).length} docket{uninvoiced(deal).length > 1 ? "s" : ""} to invoice</div> : null}
                </button>
              );
            })}
            {!deals.length ? <div className="px-2 py-2 text-[12.5px] text-muted">—</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function DealList({ match, today }: { match: (deal: Deal) => boolean; today: string }) {
  const ops = useOps();
  const deals = (ops.data?.deals || []).filter((deal) => match(deal) && !isHistoric(deal, today)).sort((a, b) => b.no.localeCompare(a.no, undefined, { numeric: true }));
  if (!deals.length) return <EmptyState title="No deals yet">Add a lead to start the pipeline.</EmptyState>;
  return (
    <DataTable>
      <thead>
        <tr>
          <Th>Sale no.</Th><Th>Stage</Th><Th>Customer</Th><Th>Title</Th><Th>Quote</Th><Th>Customer PO</Th><Th>Docket</Th><Th>Invoice</Th><Th numeric>Value ex GST</Th><Th>Next action</Th>
        </tr>
      </thead>
      <tbody>
        {deals.map((deal) => (
          <tr key={deal.id}>
            <Td><TextButton className="font-mono" onClick={() => ops.openModal({ type: "deal", id: deal.id })}>{deal.no}</TextButton></Td>
            <Td><StageTag stage={deal.stage} /></Td>
            <Td>{ops.customerName(deal.customerId)}</Td>
            <Td>{deal.title}</Td>
            <Td className="font-mono text-muted">{deal.quote?.no}</Td>
            <Td className="font-mono text-muted">{deal.po?.no}</Td>
            <Td className="font-mono text-muted">{deal.dockets.map((docket) => docket.docketNo).join(", ")}{hasBackOrder(deal) && deal.dockets.length ? " " : null}{hasBackOrder(deal) && deal.dockets.length ? <span className="rounded-[3px] bg-rev-soft px-1.5 text-[11px] font-semibold text-rev uppercase">Back order</span> : null}</Td>
            <Td className="font-mono text-muted">{deal.invoices.map((invoice) => `${invoice.no}${invoice.paid ? " ✓" : ""}`).join(", ")}</Td>
            <Td numeric>{money(dealValue(deal))}</Td>
            <Td className="text-muted">{deal.nextDate ? `${fmtDate(deal.nextDate)} · ` : ""}{deal.nextAction}</Td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function History({ match, today }: { match: (deal: Deal) => boolean; today: string }) {
  const ops = useOps();
  const rows = (ops.data?.deals || [])
    .filter((deal) => isHistoric(deal, today) && match(deal) && (ops.historyFy === "all" || String(fyOf(deal.closedAt)) === ops.historyFy))
    .sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)));
  const value = rows.reduce((sum, deal) => sum + dealValue(deal), 0);
  const invoiced = rows.reduce((sum, deal) => sum + invoicedTotal(deal), 0);
  const days = rows.map(leadToPaidDays).filter((day): day is number => day != null);
  const avg = days.length ? Math.round(days.reduce((sum, day) => sum + day, 0) / days.length) : null;
  return (
    <>
      <Note>Sales move here automatically {HIST_DAYS} days after they close (all invoices paid). Every record stays linked to its sale number.</Note>
      {!rows.length ? <EmptyState title="No historic sales yet">A closed sale lands here {HIST_DAYS} days after its final payment.</EmptyState> : (
        <>
          <Tiles>
            <Tile label="Sales in manifest" value={rows.length} />
            <Tile label="Value ex GST" value={money(value)} />
            <Tile label="Invoiced inc GST" value={money(invoiced)} />
            <Tile label="Avg lead to paid" value={avg == null ? "—" : `${avg} days`} />
          </Tiles>
          <DataTable>
            <thead>
              <tr>
                <Th>Sale no.</Th><Th>Customer</Th><Th>Title</Th><Th>Quote</Th><Th>Customer PO</Th><Th>Dockets</Th><Th>Invoices</Th><Th numeric>Value ex GST</Th><Th numeric>Invoiced inc GST</Th><Th>Last payment</Th><Th>Closed</Th><Th numeric>Days</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((deal) => (
                <tr key={deal.id}>
                  <Td><TextButton className="font-mono" onClick={() => ops.openModal({ type: "deal", id: deal.id })}>{deal.no}</TextButton></Td>
                  <Td>{ops.customerName(deal.customerId)}</Td>
                  <Td>{deal.title}</Td>
                  <Td className="font-mono text-muted">{deal.quote?.no}</Td>
                  <Td className="font-mono text-muted">{deal.po?.no}</Td>
                  <Td className="font-mono text-muted">{deal.dockets.map((docket) => docket.docketNo).join(", ")}</Td>
                  <Td className="font-mono text-muted">{deal.invoices.map((invoice) => invoice.no).join(", ")}</Td>
                  <Td numeric>{money(dealValue(deal))}</Td>
                  <Td numeric>{money(invoicedTotal(deal))}</Td>
                  <Td className="text-muted">{fmtDate(deal.invoices.find((invoice) => invoice.paid)?.paidAt)}</Td>
                  <Td className="text-muted">{fmtDate(deal.closedAt)}</Td>
                  <Td numeric>{leadToPaidDays(deal) ?? ""}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}
    </>
  );
}

function Customers() {
  const ops = useOps();
  const query = ops.salesQuery.toLowerCase();
  const customers = (ops.data?.customers || [])
    .filter((customer) => !query || [customer.name, customer.abn, customer.site, ...customer.contacts.map((contact) => contact.name + " " + contact.email)].join(" ").toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!customers.length) return <EmptyState title="No customers yet">Add a customer, or create one while you add a lead.</EmptyState>;
  return (
    <DataTable>
      <thead>
        <tr><Th>Customer</Th><Th>Site / address</Th><Th>Main contact</Th><Th>Phone</Th><Th numeric>Open deals</Th><Th numeric>Won value</Th></tr>
      </thead>
      <tbody>
        {customers.map((customer) => {
          const deals = (ops.data?.deals || []).filter((deal) => deal.customerId === customer.id);
          const won = deals.filter((deal) => ["po", "production", "ready", "dispatched", "invoiced", "closed"].includes(deal.stage)).reduce((sum, deal) => sum + dealValue(deal), 0);
          const contact = customer.contacts[0];
          const openCount = deals.filter((deal) => !["invoiced", "closed", "lost"].includes(deal.stage)).length;
          return (
            <tr key={customer.id}>
              <Td><TextButton onClick={() => ops.openModal({ type: "customer", id: customer.id })}>{customer.name}</TextButton></Td>
              <Td className="text-muted">{customer.site || customer.address}</Td>
              <Td>{contact?.name}</Td>
              <Td className="text-muted">{contact?.phone}</Td>
              <Td numeric>{openCount || ""}</Td>
              <Td numeric>{won ? money(won) : ""}</Td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

function exportDeals(ops: ReturnType<typeof useOps>) {
  const rows: (string | number)[][] = [["Sale", "Stage", "Customer", "Title", "Value ex GST"]];
  for (const deal of ops.data?.deals || []) rows.push([deal.no, deal.stage, ops.customerName(deal.customerId), deal.title, dealValue(deal).toFixed(2)]);
  downloadCsv(`sales_${todayISO()}.csv`, rows);
  ops.toast("Sales exported");
}
