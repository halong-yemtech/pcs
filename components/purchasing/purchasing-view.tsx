"use client";

import { Button, TextButton } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { SearchInput } from "@/components/ui/field";
import { EmptyState, Note, PageHead, Panel, Tile, Tiles } from "@/components/ui/panel";
import { DataTable, Td, Th } from "@/components/ui/table";
import { StatusTag } from "@/components/ui/tag";
import { buyOf, stockStatus } from "@/lib/domain/bom";
import { downloadCsv } from "@/lib/domain/download";
import { fmtDate, money, todayISO } from "@/lib/domain/format";
import { PO_LABEL } from "@/lib/domain/types";
import { useOps } from "@/components/providers/ops-provider";

export function PurchasingView() {
  const ops = useOps();
  if (!ops.data) return <Panel><EmptyState>Loading…</EmptyState></Panel>;
  const open = ops.data.pos.filter((po) => ["draft", "sent", "part"].includes(po.status));
  const outstanding = open.reduce((sum, po) => sum + po.lines.reduce((lineSum, line) => lineSum + Math.max(0, line.qty - line.received) * line.price, 0), 0);
  const low = ops.data.parts.filter((part) => ["low", "out"].includes(stockStatus(part.id, ops.data!.stock)) && !ops.data!.pos.some((po) => ["sent", "part", "draft"].includes(po.status) && po.lines.some((line) => line.itemId === part.id && line.qty > line.received))).length;
  const month = todayISO().slice(0, 7);
  const received = ops.data.moves.filter((move) => move.type === "receive" && move.at.startsWith(month)).reduce((sum, move) => sum + move.qty * buyOf(move.itemId, ops.data!.prices), 0);
  const openRfqs = ops.data.rfqs.filter((rfq) => ["draft", "sent", "quoted"].includes(rfq.status)).length;
  return (
    <Panel>
      <PageHead
        eyebrow="RFQ → supplier quote → price check → purchase order → receiving"
        title="Purchasing"
        actions={
          <>
            {ops.purchTab === "suppliers" ? <Button tone="primary" onClick={() => ops.openModal({ type: "supplier" })}>+ New supplier</Button> : null}
            {ops.purchTab !== "suppliers" ? <Button tone="primary" onClick={() => ops.toast("A new purchase order starts from a supplier and the items below minimum.")}>+ New purchase order</Button> : null}
            <Button onClick={() => exportPurch(ops)}>Export</Button>
          </>
        }
      >
        <Tiles>
          <Tile label="Open purchase orders" value={open.length} note={`${money(outstanding)} still to receive`} />
          <Tile label="Below minimum, not on order" value={low} warn={low > 0} />
          <Tile label="Received this month" value={money(received)} note="at buy price" />
        </Tiles>
        <div className="flex flex-wrap items-center gap-2">
          <ChipRow>
            <Chip pressed={ops.purchTab === "rfqs"} onClick={() => ops.setPurchTab("rfqs")}>RFQs ({openRfqs})</Chip>
            <Chip pressed={ops.purchTab === "open"} onClick={() => ops.setPurchTab("open")}>Open POs</Chip>
            <Chip pressed={ops.purchTab === "closed"} onClick={() => ops.setPurchTab("closed")}>Received & cancelled</Chip>
            <Chip pressed={ops.purchTab === "suppliers"} onClick={() => ops.setPurchTab("suppliers")}>Suppliers ({ops.data.suppliers.length})</Chip>
            <Chip pressed={ops.purchTab === "pricelog"} onClick={() => ops.setPurchTab("pricelog")}>Price log</Chip>
          </ChipRow>
          <SearchInput className="max-w-[320px]" placeholder="Search supplier, PO number or item" value={ops.purchQuery} onChange={(event) => ops.setPurchQuery(event.target.value)} />
        </div>
      </PageHead>
      <div className="grid gap-3 px-4 pb-[18px]">
        {ops.purchTab === "rfqs" ? <Rfqs /> : null}
        {ops.purchTab === "suppliers" ? <Suppliers /> : null}
        {ops.purchTab === "pricelog" ? <PriceLog /> : null}
        {ops.purchTab === "open" || ops.purchTab === "closed" ? <Orders /> : null}
      </div>
    </Panel>
  );
}

function Orders() {
  const ops = useOps();
  const statuses = ops.purchTab === "open" ? ["draft", "sent", "part"] : ["received", "cancelled"];
  const query = ops.purchQuery.toLowerCase();
  const rows = (ops.data?.pos || []).filter((po) => statuses.includes(po.status) && (!query || [po.no, ops.supplierName(po.supplierId), po.ref, ...po.lines.map((line) => ops.partMap.get(line.itemId)?.partNo)].join(" ").toLowerCase().includes(query))).sort((a, b) => b.no.localeCompare(a.no, undefined, { numeric: true }));
  if (!rows.length) return <EmptyState title={`No ${ops.purchTab === "open" ? "open" : "closed"} purchase orders`}>{ops.purchTab === "open" ? "Create one for a supplier, or order everything that is below its minimum stock level." : null}</EmptyState>;
  const today = todayISO();
  return (
    <DataTable>
      <thead><tr><Th>PO</Th><Th>Status</Th><Th>Supplier</Th><Th>Sale</Th><Th numeric>Lines</Th><Th numeric>Total ex GST</Th><Th numeric>To receive</Th><Th>Ordered</Th><Th>Expected</Th></tr></thead>
      <tbody>
        {rows.map((po) => {
          const total = po.lines.reduce((sum, line) => sum + line.qty * line.price, 0);
          const left = po.lines.reduce((sum, line) => sum + Math.max(0, line.qty - line.received) * line.price, 0);
          const late = po.expected && po.expected < today && ["sent", "part"].includes(po.status);
          const sale = ops.data?.deals.find((deal) => deal.id === po.saleId);
          return (
            <tr key={po.id}>
              <Td><TextButton className="font-mono" onClick={() => ops.openModal({ type: "po", id: po.id })}>{po.no}</TextButton></Td>
              <Td><StatusTag status={po.status} label={PO_LABEL[po.status] || po.status} /></Td>
              <Td>{ops.supplierName(po.supplierId)}</Td>
              <Td className="font-mono text-muted">{sale?.no}</Td>
              <Td numeric>{po.lines.length}</Td>
              <Td numeric>{money(total)}</Td>
              <Td numeric>{money(left)}</Td>
              <Td className="text-muted">{fmtDate(po.date)}</Td>
              <Td className={late ? "text-bad" : "text-muted"}>{fmtDate(po.expected)}</Td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

function Suppliers() {
  const ops = useOps();
  const query = ops.purchQuery.toLowerCase();
  const rows = (ops.data?.suppliers || []).filter((supplier) => !query || [supplier.name, supplier.abn, supplier.email, supplier.phone].join(" ").toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name));
  if (!rows.length) return <EmptyState title="No suppliers yet">Add your suppliers, then link the items they supply with their part numbers and prices.</EmptyState>;
  return (
    <DataTable>
      <thead><tr><Th>Supplier</Th><Th>Phone</Th><Th>Email</Th><Th numeric>Items supplied</Th><Th numeric>Lead time</Th><Th numeric>Open POs</Th><Th numeric>Spend (received)</Th></tr></thead>
      <tbody>
        {rows.map((supplier) => {
          const pos = (ops.data?.pos || []).filter((po) => po.supplierId === supplier.id);
          const spend = pos.reduce((sum, po) => sum + po.lines.reduce((lineSum, line) => lineSum + line.received * line.price, 0), 0);
          return (
            <tr key={supplier.id}>
              <Td><TextButton onClick={() => ops.openModal({ type: "supplier", id: supplier.id })}>{supplier.name}</TextButton></Td>
              <Td className="text-muted">{supplier.phone}</Td>
              <Td className="text-muted">{supplier.email}</Td>
              <Td numeric>{Object.keys(supplier.items).length || ""}</Td>
              <Td numeric>{supplier.lead ? `${supplier.lead} d` : ""}</Td>
              <Td numeric>{pos.filter((po) => ["draft", "sent", "part"].includes(po.status)).length || ""}</Td>
              <Td numeric>{money(spend)}</Td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

function Rfqs() {
  const ops = useOps();
  const rows = ops.data?.rfqs || [];
  if (!rows.length) return <EmptyState title="No RFQs">Send a request for quote before you raise the purchase order.</EmptyState>;
  return (
    <DataTable>
      <thead><tr><Th>RFQ</Th><Th>Status</Th><Th>Supplier</Th><Th>Sent</Th><Th>Reply by</Th><Th numeric>Lines</Th></tr></thead>
      <tbody>
        {rows.map((rfq) => (
          <tr key={rfq.id}>
            <Td className="font-mono">{rfq.no}</Td>
            <Td><StatusTag status={rfq.status} label={rfq.status} /></Td>
            <Td>{ops.supplierName(rfq.supplierId)}</Td>
            <Td className="text-muted">{fmtDate(rfq.date)}</Td>
            <Td className={rfq.replyBy < todayISO() && rfq.status === "sent" ? "text-bad" : "text-muted"}>{fmtDate(rfq.replyBy)}</Td>
            <Td numeric>{rfq.lines.length}</Td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function PriceLog() {
  const ops = useOps();
  const query = ops.purchQuery.toLowerCase();
  const rows = (ops.data?.priceLog || []).filter((entry) => {
    const part = ops.partMap.get(entry.itemId);
    return !query || [part?.partNo, part?.description, entry.source].join(" ").toLowerCase().includes(query);
  });
  if (!rows.length) return <Note>No buy price changes recorded.</Note>;
  return (
    <DataTable>
      <thead><tr><Th>When</Th><Th>Item</Th><Th numeric>Buy price</Th><Th>Source</Th></tr></thead>
      <tbody>
        {rows.map((entry) => (
          <tr key={entry.id}>
            <Td className="text-muted">{fmtDate(entry.at)}</Td>
            <Td><TextButton className="font-mono" onClick={() => ops.selectItem(entry.itemId, "stock")}>{ops.partMap.get(entry.itemId)?.partNo}</TextButton></Td>
            <Td numeric>{money(entry.buy)}</Td>
            <Td className="text-muted">{entry.source}</Td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function exportPurch(ops: ReturnType<typeof useOps>) {
  const rows: (string | number)[][] = [["PO", "Status", "Supplier", "Total"]];
  for (const po of ops.data?.pos || []) rows.push([po.no, po.status, ops.supplierName(po.supplierId), po.lines.reduce((sum, line) => sum + line.qty * line.price, 0).toFixed(2)]);
  downloadCsv(`purchasing_${todayISO()}.csv`, rows);
  ops.toast("Purchasing exported");
}
