"use client";

import { Button, TextButton } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { SearchInput } from "@/components/ui/field";
import { EmptyState, Kv, KvItem, Note, PageHead, Panel, Tile, Tiles } from "@/components/ui/panel";
import { DataTable, Td, Th } from "@/components/ui/table";
import { LevelTag } from "@/components/ui/tag";
import { lines, onHand, unitCost } from "@/lib/domain/bom";
import { downloadCsv } from "@/lib/domain/download";
import { money, qfmt, todayISO, when } from "@/lib/domain/format";
import { ORDER_LABEL, ORDER_STATUSES } from "@/lib/domain/types";
import { useOps } from "@/components/providers/ops-provider";

export function OrdersView() {
  const ops = useOps();
  if (!ops.data) return <Panel><EmptyState>Loading…</EmptyState></Panel>;
  const query = ops.orderQuery.toLowerCase();
  const orders = [...ops.data.orders].sort((a, b) => b.no.localeCompare(a.no, undefined, { numeric: true }));
  const list = orders.filter((order) => {
    if (order.status !== ops.orderTab) return false;
    if (!query) return true;
    const part = ops.partMap.get(order.itemId);
    const deal = ops.data?.deals.find((item) => item.id === order.dealId);
    return [order.no, deal?.no, order.customer, order.ref, part?.partNo, part?.description].join(" ").toLowerCase().includes(query);
  });
  const count = (status: string) => orders.filter((order) => order.status === status).length;
  let finishedQty = 0;
  let finishedValue = 0;
  for (const part of ops.data.parts) {
    if (part.level !== "Product" || onHand(part.id, ops.data.stock) <= 0) continue;
    finishedQty += onHand(part.id, ops.data.stock);
    finishedValue += onHand(part.id, ops.data.stock) * unitCost(part.id, ops.partMap, ops.data.prices);
  }
  const month = todayISO().slice(0, 7);
  const sold = orders.filter((order) => order.status === "sold" && (order.soldAt || "").startsWith(month));
  const revenue = sold.reduce((sum, order) => sum + order.sell * order.qty, 0);
  const cost = sold.reduce((sum, order) => sum + (order.costTotal || 0), 0);
  const selected = orders.find((order) => order.id === ops.selectedOrderId);
  return (
    <Panel>
      <PageHead
        eyebrow="Build orders raised from sales at Start production"
        title="Orders"
        actions={<Button onClick={() => { downloadCsv(`orders_${todayISO()}.csv`, [["Order", "Status", "Item", "Qty", "Customer"], ...orders.map((order) => [order.no, order.status, ops.partMap.get(order.itemId)?.partNo || "", order.qty, order.customer])]); ops.toast("Orders exported"); }}>Export</Button>}
      >
        <Tiles>
          <Tile label="Open orders" value={count("open")} />
          <Tile label="Finished products on hand" value={qfmt(finishedQty)} note={`${money(finishedValue)} at cost`} />
          <Tile label="Dispatched this month" value={money(revenue)} note={`${sold.length} order${sold.length === 1 ? "" : "s"} · margin ${revenue ? `${(((revenue - cost) / revenue) * 100).toFixed(1)}%` : "—"}`} />
        </Tiles>
        <div className="flex flex-wrap items-center gap-2">
          <ChipRow>
            {ORDER_STATUSES.map(([id, label]) => (
              <Chip key={id} pressed={ops.orderTab === id} onClick={() => { ops.setOrderTab(id); ops.setSelectedOrderId(null); }}>{label} ({count(id)})</Chip>
            ))}
          </ChipRow>
          <SearchInput className="max-w-[320px]" placeholder="Search sale no., order, customer, PO or item" value={ops.orderQuery} onChange={(event) => ops.setOrderQuery(event.target.value)} />
        </div>
      </PageHead>
      <div className="grid gap-3 px-4 pb-[18px]">
        {!list.length ? (
          <EmptyState title={`No ${ORDER_LABEL[ops.orderTab].toLowerCase()} orders`}>
            {ops.orderTab === "open" ? "Build orders are raised from a sale: open the sale in Sales and use Start production after the customer PO is received." : null}
          </EmptyState>
        ) : (
          <DataTable>
            <thead>
              <tr><Th>Sale no.</Th><Th>Order</Th><Th>Product</Th><Th>Description</Th><Th numeric>Qty</Th><Th>Customer</Th><Th>Reference</Th><Th numeric>Sell total</Th><Th>{ops.orderTab === "sold" ? "Sold" : ops.orderTab === "built" ? "Built" : "Created"}</Th><Th /></tr>
            </thead>
            <tbody>
              {list.map((order) => {
                const part = ops.partMap.get(order.itemId);
                const deal = ops.data?.deals.find((item) => item.id === order.dealId);
                const stamp = order.status === "sold" ? order.soldAt : order.status === "built" ? order.builtAt : order.createdAt;
                return (
                  <tr key={order.id} className={order.id === ops.selectedOrderId ? "bg-accent-soft" : ""}>
                    <Td>{deal ? <TextButton className="font-mono" onClick={() => ops.openModal({ type: "deal", id: deal.id })}>{deal.no}</TextButton> : <span className="rounded-[3px] bg-rev-soft px-1.5 py-px text-[11px] font-semibold text-rev uppercase">No sale</span>}</Td>
                    <Td><TextButton className="font-mono" onClick={() => ops.setSelectedOrderId(order.id)}>{order.no}</TextButton></Td>
                    <Td><TextButton className="font-mono" onClick={() => ops.selectItem(order.itemId)}>{part?.partNo || order.itemId}</TextButton></Td>
                    <Td>{part?.description}</Td>
                    <Td numeric>{qfmt(order.qty)}</Td>
                    <Td>{order.customer}</Td>
                    <Td className="text-muted">{order.ref}</Td>
                    <Td numeric>{money(order.sell * order.qty)}</Td>
                    <Td className="text-muted whitespace-nowrap">{when(stamp)}</Td>
                    <Td><Button size="sm" onClick={() => ops.setSelectedOrderId(order.id)}>Open</Button></Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
        {selected ? <OrderDetail id={selected.id} /> : null}
      </div>
    </Panel>
  );
}

function OrderDetail({ id }: { id: string }) {
  const ops = useOps();
  const order = ops.data?.orders.find((item) => item.id === id);
  const part = order ? ops.partMap.get(order.itemId) : undefined;
  if (!order || !ops.data) return null;
  const pulls = new Map<string, number>();
  if (order.status === "open" && part) {
    const walk = (partId: string, qty: number, seen: Set<string>) => {
      const node = ops.partMap.get(partId);
      const partLines = lines(node);
      if (node && partLines.length && !seen.has(partId)) {
        seen.add(partId);
        for (const line of partLines) walk(line.partId, qty * line.qty, seen);
        seen.delete(partId);
      } else pulls.set(partId, (pulls.get(partId) || 0) + qty);
    };
    walk(order.itemId, order.qty, new Set());
  }
  return (
    <div className="grid gap-3 rounded-app border border-accent bg-surface px-4 py-3.5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-muted">{ORDER_LABEL[order.status]} · created {when(order.createdAt)}</div>
          <h2 className="m-0 font-display text-2xl font-semibold">{order.no} · {qfmt(order.qty)} × <span className="font-mono text-[0.7em]">{part?.partNo || order.itemId}</span></h2>
          <div>{part?.description}</div>
        </div>
        <Button size="sm" onClick={() => ops.setSelectedOrderId(null)}>Close</Button>
      </div>
      <Kv>
        <KvItem label="Sale no.">{ops.data.deals.find((deal) => deal.id === order.dealId)?.no || "Not linked to a sale"}</KvItem>
        <KvItem label="Customer">{order.customer || "—"}</KvItem>
        <KvItem label="Customer PO">{order.ref || "—"}</KvItem>
        <KvItem label="Due">{order.due || "—"}</KvItem>
        <KvItem label="Sell price each">{money(order.sell)}</KvItem>
        <KvItem label="Sell total">{money(order.sell * order.qty)}</KvItem>
        <KvItem label="Product on hand">{qfmt(onHand(order.itemId, ops.data.stock))}</KvItem>
      </Kv>
      {order.notes ? <Note>{order.notes}</Note> : null}
      {order.status === "open" ? (
        <>
          <h2 className="m-0 font-display text-[19px] font-semibold">Build plan</h2>
          <Note>Building {qfmt(order.qty)} × {part?.partNo} pulls these items from stock. Parts already on hand are used first.</Note>
          <DataTable maxHeight="40vh">
            <thead><tr><Th>Item code</Th><Th>Level</Th><Th>Description</Th><Th numeric>Pull from stock</Th><Th numeric>On hand</Th><Th numeric>After</Th></tr></thead>
            <tbody>
              {[...pulls.entries()].map(([itemId, qty]) => {
                const child = ops.partMap.get(itemId);
                const hand = onHand(itemId, ops.data!.stock);
                return (
                  <tr key={itemId}>
                    <Td><TextButton className="font-mono" onClick={() => ops.selectItem(itemId)}>{child?.partNo || itemId}</TextButton></Td>
                    <Td><LevelTag level={child?.level} /></Td>
                    <Td>{child?.description}</Td>
                    <Td numeric>{qfmt(qty)}</Td>
                    <Td numeric>{qfmt(hand)}</Td>
                    <Td numeric className={hand - qty < 0 ? "text-bad" : ""}>{qfmt(hand - qty)}</Td>
                  </tr>
                );
              })}
              {!pulls.size ? <tr><Td className="text-muted">This product has no BOM yet.</Td></tr> : null}
            </tbody>
          </DataTable>
          <div className="flex flex-wrap gap-2">
            <Button tone="primary" onClick={() => {
              ops.saveOrder({ ...order, status: "built", builtAt: new Date().toISOString(), costTotal: [...pulls.entries()].reduce((sum, [itemId, qty]) => sum + qty * unitCost(itemId, ops.partMap, ops.data!.prices), 0) });
              ops.moveStock(order.itemId, order.qty, "build", `Built ${order.no}`);
              ops.toast(`${order.no} built into stock`);
            }}>Build {qfmt(order.qty)} into stock</Button>
          </div>
        </>
      ) : null}
      {order.status === "built" ? <Note>Built and on hand. It leaves stock on the sale’s delivery docket when the sale is dispatched.</Note> : null}
      {order.status === "sold" ? <Note>Dispatched {when(order.soldAt)} on the sale’s delivery docket.</Note> : null}
    </div>
  );
}
