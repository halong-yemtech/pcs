"use client";

import { useState } from "react";
import { Button, TextButton } from "@/components/ui/button";
import { controlClass, SelectInput, TextInput } from "@/components/ui/field";
import { EmptyState, Kv, KvItem, Note, Panel } from "@/components/ui/panel";
import { DataTable, Td, Th } from "@/components/ui/table";
import { LevelTag, StockTag } from "@/components/ui/tag";
import { bomCost, buyOf, canBuild, explode, isAsm, leafList, marginPct, onHand, sellOf, stockStatus, unitCost } from "@/lib/domain/bom";
import { DOC_TYPES, LEVELS } from "@/lib/domain/types";
import { fileSize, fmtDate, kg, money, qfmt, when } from "@/lib/domain/format";
import { useOps } from "@/components/providers/ops-provider";

export function ItemWorkspace() {
  const ops = useOps();
  if (!ops.ready || !ops.data) return <Panel><EmptyState>Loading the product database…</EmptyState></Panel>;
  const part = ops.selectedId ? ops.partMap.get(ops.selectedId) : undefined;
  if (!part) return <Panel><EmptyState title="Pick an item">Choose an item from the list, or open a product type and click a variant.</EmptyState></Panel>;
  const id = part.id;
  const prices = ops.data.prices;
  const stock = ops.data.stock;
  const buy = buyOf(id, prices);
  const sell = sellOf(id, prices);
  const margin = marginPct(id, ops.partMap, prices);
  const row = stock[id];
  const used = ops.usedBy.get(id) || [];
  const products = part.productIds.map((productId) => ops.productMap.get(productId)).filter((product) => !!product);
  const attrs = Object.entries(part.attrs).filter(([key]) => !/weigh/i.test(key));
  const asm = isAsm(part);
  return (
    <Panel>
      <div className="grid gap-3 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[13px] text-muted">
              Item code <strong className="text-ink">{part.partNo}</strong>
              {part.tempCode ? <span className="ml-1 rounded-[3px] bg-rev-soft px-1.5 py-px text-[11px] font-semibold text-rev uppercase">Temp code</span> : null}
              {part.orderNo ? <> · Ordering no. <span>{part.orderNo}</span></> : null}
              {part.role ? <> · role {part.role}</> : null}
            </div>
            <h1 className="m-0 font-display text-[30px] font-semibold leading-[1.05] text-balance">{part.description}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => ops.openModal({ type: "item", id })}>Edit details</Button>
            <Button onClick={() => ops.toast("Excel export uses the item code, BOM lines and prices.")}>Export Excel</Button>
          </div>
        </div>
        <Kv>
          <KvItem label="Level">
            <SelectInput className="w-auto" aria-label="Level" value={part.level} onChange={(event) => { ops.patchPart(id, { level: event.target.value }); ops.toast(event.target.value ? `Level set to ${event.target.value}` : "Level cleared"); }}>
              <option value="">Not set</option>
              {LEVELS.map((level) => <option key={level}>{level}</option>)}
            </SelectInput>
          </KvItem>
          <KvItem label="Buy price">
            <div className="font-display text-[26px] font-semibold tabular-nums">{buy ? money(buy) : <span className="text-muted">Not set</span>}</div>
            {asm ? <div className="text-[12.5px] font-normal text-muted">BOM cost {money(bomCost(id, ops.partMap, prices))}</div> : null}
          </KvItem>
          <KvItem label="Sell price">
            <div className="font-display text-[26px] font-semibold tabular-nums">{sell ? money(sell) : <span className="text-muted">Not set</span>}</div>
            <div className="text-[12.5px] font-normal text-muted">Margin {margin == null ? "—" : <span className={margin < 0 ? "text-bad" : ""}>{margin.toFixed(1)}%</span>}</div>
          </KvItem>
          <KvItem label="On hand">
            <div className="font-display text-[26px] font-semibold tabular-nums">{row?.onHand != null ? qfmt(onHand(id, stock)) : <span className="text-muted">—</span>} <StockTag status={stockStatus(id, stock)} /></div>
            {row?.min ? <div className="text-[12.5px] font-normal text-muted">Min {qfmt(row.min)}</div> : null}
          </KvItem>
          {part.width ? <KvItem label="Belt width">{part.width} mm</KvItem> : null}
          {part.material ? <KvItem label="Material / version">{part.material}</KvItem> : null}
          {attrs.map(([key, value]) => (
            <KvItem key={key} label={/tip width/i.test(key) ? "Product (tip) width" : key.replace(/\s*\(.*?\)/, "")}>
              {value}{/\(mm\)/.test(key) && /^[\d.]+$/.test(value) ? " mm" : ""}
            </KvItem>
          ))}
          {part.weight ? <KvItem label="Catalogue weight">{part.weight} kg</KvItem> : null}
          <KvItem label="Supplier">{ops.supplierName(row?.supplierId) || part.supplier || "—"}</KvItem>
          <KvItem label="Product type">
            {products.length ? products.slice(0, 4).map((product, index) => (
              <span key={product.id}>{index ? ", " : ""}<TextButton onClick={() => ops.selectProduct(product.id)}>{product.name}</TextButton></span>
            )) : "—"}
            {products.length > 4 ? ` +${products.length - 4} more` : ""}
          </KvItem>
          <KvItem label="Used in">
            {used.length ? used.slice(0, 6).map((parentId, index) => (
              <span key={parentId}>{index ? ", " : ""}<TextButton className="font-mono" onClick={() => ops.selectItem(parentId)}>{ops.partMap.get(parentId)?.partNo}</TextButton></span>
            )) : "Not used in a BOM"}
            {used.length > 6 ? ` +${used.length - 6} more` : ""}
          </KvItem>
        </Kv>
        {part.notes ? <Note>{part.notes}</Note> : null}
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-line px-3" role="tablist">
        {(
          [
            ["structure", "Structure"],
            ["stock", "Prices & stock"],
            ["costing", "Costing & quantities"],
            ["documents", `Documents (${ops.data.docs.filter((doc) => doc.partId === id).length})`],
          ] as const
        ).map(([tab, label]) => (
          <button key={tab} type="button" role="tab" aria-selected={ops.itemTab === tab} onClick={() => ops.setItemTab(tab)} className={`-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-3 py-2.5 font-medium whitespace-nowrap ${ops.itemTab === tab ? "border-accent text-ink" : "border-transparent text-muted"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-3.5 px-4 py-3.5">
        {ops.itemTab === "structure" ? <Structure id={id} /> : null}
        {ops.itemTab === "stock" ? <Prices id={id} /> : null}
        {ops.itemTab === "costing" ? <Costing id={id} /> : null}
        {ops.itemTab === "documents" ? <Documents id={id} /> : null}
      </div>
    </Panel>
  );
}

function Structure({ id }: { id: string }) {
  const ops = useOps();
  const part = ops.partMap.get(id);
  const [code, setCode] = useState("");
  const [qty, setQty] = useState(1);
  if (!part || !ops.data) return null;
  const rows = explode(id, ops.partMap, ops.collapsed);
  const next = LEVELS[LEVELS.indexOf(part.level as (typeof LEVELS)[number]) + 1] || "";
  return (
    <>
      {!rows.length ? (
        <EmptyState>No components yet.{part.kind === "variant" && part.productIds.length ? " The quickest way to fill this in is the product type’s component matrix." : ""} You can also add components below.</EmptyState>
      ) : (
        <>
          <DataTable>
            <thead>
              <tr><Th>Item code</Th><Th>Level</Th><Th>Role</Th><Th>Description</Th><Th numeric>Qty per</Th><Th numeric>Total qty</Th><Th numeric>Unit cost</Th><Th numeric>Ext. cost</Th><Th numeric>On hand</Th><Th /></tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const child = row.part;
                const cost = unitCost(row.id, ops.partMap, ops.data!.prices);
                if (!child) return <tr key={row.key}><Td className="text-bad">Missing item {row.id}</Td></tr>;
                return (
                  <tr key={row.key} className={row.level === 1 ? "" : "text-muted"}>
                    <Td>
                      <span className="inline-flex items-center gap-1 whitespace-nowrap" style={{ paddingLeft: (row.level - 1) * 18 }}>
                        <button type="button" className={`grid size-[18px] place-items-center border-0 bg-transparent p-0 text-muted ${row.hasKids ? "" : "invisible"}`} aria-label="Expand or collapse" onClick={() => ops.toggleCollapsed(row.key)}>{ops.collapsed.has(row.key) ? "▸" : "▾"}</button>
                        <span className="inline-block min-w-[18px] rounded-[3px] border border-line text-center font-mono text-[11px]">{row.level}</span>
                        <TextButton className="font-mono text-ink" onClick={() => ops.selectItem(row.id)}>{child.partNo}</TextButton>
                      </span>
                    </Td>
                    <Td><LevelTag level={child.level} /></Td>
                    <Td>{row.role ? <span className="rounded-[3px] border border-line bg-sunk px-1.5 py-px text-[11px] font-semibold uppercase">{row.role}</span> : null}</Td>
                    <Td className={row.level === 1 ? "" : ""}>{child.description}{child.orderNo ? <span className="font-mono text-muted"> {child.orderNo}</span> : null}{row.cycle ? <span className="text-bad"> Loop</span> : null}</Td>
                    <Td numeric>
                      {row.level === 1 ? (
                        <SelectInput className="w-[76px] text-right" aria-label="Quantity per" value={String(row.qty)} onChange={(event) => setLineQty(ops, id, row.index, Number(event.target.value))}>
                          {Array.from({ length: 101 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                        </SelectInput>
                      ) : qfmt(row.qty)}
                    </Td>
                    <Td numeric>{qfmt(row.total)}</Td>
                    <Td numeric>{money(cost)}</Td>
                    <Td numeric>{money(cost * row.qty)}</Td>
                    <Td numeric>{ops.data?.stock[row.id]?.onHand != null ? qfmt(onHand(row.id, ops.data.stock)) : "—"} {["low", "out"].includes(stockStatus(row.id, ops.data!.stock)) ? <StockTag status={stockStatus(row.id, ops.data!.stock)} /> : null}</Td>
                    <Td>{row.level === 1 ? <Button size="sm" tone="danger" onClick={() => removeLine(ops, id, row.index)}>Remove</Button> : null}</Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          <Note>
            <TextButton onClick={() => ops.setCollapsed(new Set())}>Expand all</TextButton>
            {" · "}
            <TextButton onClick={() => ops.setCollapsed(new Set(explode(id, ops.partMap).filter((row) => row.hasKids).map((row) => row.key)))}>Collapse all</TextButton>
            {" · Total qty is per one "}{part.partNo}.
          </Note>
        </>
      )}
      <div>
        <h2 className="m-0 mb-2 font-display text-[19px] font-semibold">Add {next ? next.toLowerCase() : "component"}{next ? "s" : ""} to this {(part.level || "item").toLowerCase()}</h2>
        <div className="grid grid-cols-[minmax(0,2fr)_90px_auto_auto] items-end gap-2 max-[600px]:grid-cols-[minmax(0,1fr)_80px]">
          <label className="grid gap-0.5 text-xs text-muted">Item code
            <TextInput className="font-mono" value={code} placeholder="Type an item code" onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addLine(); }} />
          </label>
          <label className="grid gap-0.5 text-xs text-muted">Qty per
            <SelectInput className="text-right" value={String(qty)} onChange={(event) => setQty(Number(event.target.value))}>
              {Array.from({ length: 20 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
            </SelectInput>
          </label>
          <Button tone="primary" onClick={addLine}>Add</Button>
          <Button onClick={() => ops.openModal({ type: "item" })}>+ New item as component</Button>
        </div>
      </div>
    </>
  );

  function addLine() {
    const found = ops.findByNo(code);
    if (!found) {
      ops.toast("No item with that code.");
      return;
    }
    if (found === id) {
      ops.toast("An item can’t contain itself.");
      return;
    }
    const nextLines = [...part!.components.filter((line) => line.qty > 0), { partId: found, qty, role: ops.partMap.get(found)?.role || "" }];
    ops.patchPart(id, { components: nextLines });
    setCode("");
    ops.toast("Added to BOM");
  }
}

function setLineQty(ops: ReturnType<typeof useOps>, id: string, index: number, qty: number) {
  const part = ops.partMap.get(id);
  if (!part) return;
  const next = part.components.map((line, i) => (i === index ? { ...line, qty } : line)).filter((line) => line.qty > 0);
  ops.patchPart(id, { components: next });
  ops.toast(qty <= 0 ? "Removed" : "Quantity updated");
}

function removeLine(ops: ReturnType<typeof useOps>, id: string, index: number) {
  const part = ops.partMap.get(id);
  if (!part) return;
  ops.patchPart(id, { components: part.components.filter((_, i) => i !== index) });
  ops.toast("Removed from BOM");
}

function Prices({ id }: { id: string }) {
  const ops = useOps();
  const part = ops.partMap.get(id);
  if (!part || !ops.data) return null;
  const stock = ops.data.stock[id];
  const price = ops.data.prices[id];
  const moves = ops.data.moves.filter((move) => move.itemId === id).slice(0, 40);
  const logs = ops.data.priceLog.filter((entry) => entry.itemId === id);
  const margin = marginPct(id, ops.partMap, ops.data.prices);
  const build = isAsm(part) ? canBuild(id, ops.partMap, ops.data.stock) : null;
  const suppliers = ops.data.suppliers.filter((supplier) => supplier.items[id]);
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        <div className="rounded-app border border-line bg-sunk px-3 py-2.5"><div className="text-[11px] uppercase tracking-[0.06em] text-muted">On hand</div><div className="font-display text-[26px] font-semibold">{stock?.onHand != null ? qfmt(stock.onHand) : "—"} <StockTag status={stockStatus(id, ops.data.stock)} /></div><Note className="m-0">{stock?.location ? `Location ${stock.location}` : "No location set"}</Note></div>
        <div className="rounded-app border border-line bg-sunk px-3 py-2.5"><div className="text-[11px] uppercase tracking-[0.06em] text-muted">Stock value at cost</div><div className="font-display text-[26px] font-semibold">{money(onHand(id, ops.data.stock) * unitCost(id, ops.partMap, ops.data.prices))}</div></div>
        <div className="rounded-app border border-line bg-sunk px-3 py-2.5"><div className="text-[11px] uppercase tracking-[0.06em] text-muted">Margin</div><div className="font-display text-[26px] font-semibold">{margin == null ? "—" : `${margin.toFixed(1)}%`}</div><Note className="m-0">Sell {sellOf(id, ops.data.prices) ? money(sellOf(id, ops.data.prices)) : "not set"} vs cost {money(unitCost(id, ops.partMap, ops.data.prices))}</Note></div>
        {build != null ? <div className="rounded-app border border-line bg-sunk px-3 py-2.5"><div className="text-[11px] uppercase tracking-[0.06em] text-muted">Can build from stock</div><div className="font-display text-[26px] font-semibold">{qfmt(build)}</div><Note className="m-0">Limited by direct components on hand</Note></div> : null}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
        <NumberField label="Buy price ($)" value={price?.buy} onCommit={(value) => { ops.setPrice(id, { buy: value }, "Edited on the item page"); ops.toast("Buy price saved"); }} />
        <NumberField label="Sell price ($)" value={price?.sell} onCommit={(value) => { ops.setPrice(id, { sell: value }); ops.toast("Sell price saved"); }} />
        <NumberField label="Minimum stock" value={stock?.min} onCommit={(value) => { ops.setStock(id, { min: value }); ops.toast("Minimum saved"); }} />
        <NumberField label="Reorder qty" value={stock?.reorder} onCommit={(value) => { ops.setStock(id, { reorder: value }); ops.toast("Reorder qty saved"); }} />
        <label className="grid gap-0.5 text-xs text-muted">Location / bin
          <TextInput defaultValue={stock?.location || ""} onBlur={(event) => ops.setStock(id, { location: event.target.value.trim() })} />
        </label>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
        <label className="grid gap-0.5 text-xs text-muted">Preferred supplier
          <SelectInput value={stock?.supplierId || ""} onChange={(event) => { ops.setStock(id, { supplierId: event.target.value }); ops.toast("Preferred supplier saved"); }}>
            <option value="">None</option>
            {[...ops.data.suppliers].sort((a, b) => a.name.localeCompare(b.name)).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.items[id] ? " ★" : ""}</option>)}
          </SelectInput>
        </label>
      </div>
      {suppliers.length ? (
        <DataTable>
          <thead><tr><Th>Supplier</Th><Th>Their part no.</Th><Th numeric>Price</Th><Th numeric>Min order</Th><Th numeric>Lead days</Th></tr></thead>
          <tbody>
            {suppliers.map((supplier) => {
              const item = supplier.items[id];
              return (
                <tr key={supplier.id}>
                  <Td>{supplier.name}{stock?.supplierId === supplier.id ? <span className="ml-1 rounded-[3px] bg-ok-soft px-1.5 py-px text-[11px] font-semibold text-ok uppercase">Preferred</span> : null}</Td>
                  <Td className="font-mono">{item.supCode}</Td>
                  <Td numeric>{money(item.price)}</Td>
                  <Td numeric>{item.moq}</Td>
                  <Td numeric>{item.lead || supplier.lead}</Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button tone="primary" onClick={() => ops.openModal({ type: "stock-move", id, move: "receive" })}>Receive stock</Button>
        <Button onClick={() => ops.openModal({ type: "stock-move", id, move: "issue" })}>Issue / sell</Button>
        <Button onClick={() => ops.openModal({ type: "stock-move", id, move: "adjust" })}>Stock count</Button>
      </div>
      <div>
        <h2 className="m-0 mb-2 font-display text-[19px] font-semibold">Buy price history</h2>
        {!logs.length ? <Note>No buy price changes recorded.</Note> : (
          <DataTable>
            <thead><tr><Th>When</Th><Th numeric>Buy price</Th><Th>Source</Th></tr></thead>
            <tbody>{logs.map((entry) => <tr key={entry.id}><Td className="text-muted whitespace-nowrap">{when(entry.at)}</Td><Td numeric>{money(entry.buy)}</Td><Td className="text-muted">{entry.source}</Td></tr>)}</tbody>
          </DataTable>
        )}
      </div>
      <div>
        <h2 className="m-0 mb-2 font-display text-[19px] font-semibold">Stock movements</h2>
        {!moves.length ? <Note>No movements in the last 12 months.</Note> : (
          <DataTable>
            <thead><tr><Th>When</Th><Th>Type</Th><Th numeric>Change</Th><Th numeric>On hand after</Th><Th>Note</Th></tr></thead>
            <tbody>
              {moves.map((move) => (
                <tr key={move.id}>
                  <Td className="text-muted whitespace-nowrap">{when(move.at)}</Td>
                  <Td>{move.type}</Td>
                  <Td numeric className={move.qty < 0 ? "text-bad" : ""}>{move.qty > 0 ? "+" : ""}{qfmt(move.qty)}</Td>
                  <Td numeric>{qfmt(move.after)}</Td>
                  <Td className="text-muted">{move.note}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </>
  );
}

function NumberField({ label, value, onCommit }: { label: string; value?: number | null; onCommit: (value: number | null) => void }) {
  return (
    <label className="grid gap-0.5 text-xs text-muted">{label}
      <input className={`${controlClass} text-right`} type="number" min={0} step="any" defaultValue={value ?? ""} onBlur={(event) => onCommit(event.target.value === "" ? null : Number(event.target.value))} />
    </label>
  );
}

function Costing({ id }: { id: string }) {
  const ops = useOps();
  const part = ops.partMap.get(id);
  if (!part || !ops.data) return null;
  if (!isAsm(part)) return <EmptyState>Nothing to roll up yet. Add components on the Structure tab or in the product type’s matrix.</EmptyState>;
  const leaves = leafList(id, ops.partMap);
  const material = leaves.reduce((sum, leaf) => sum + leaf.qty * buyOf(leaf.pid, ops.data!.prices), 0);
  const weight = leaves.reduce((sum, leaf) => sum + leaf.qty * Number(leaf.part?.weight || 0), 0);
  const build = ops.buildQty;
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        <div className="rounded-app border border-line bg-sunk px-3 py-2.5"><div className="text-[11px] uppercase tracking-[0.06em] text-muted">BOM cost</div><div className="font-display text-[26px] font-semibold">{money(bomCost(id, ops.partMap, ops.data.prices))}</div></div>
        <div className="rounded-app border border-line bg-sunk px-3 py-2.5"><div className="text-[11px] uppercase tracking-[0.06em] text-muted">Materials & bought-in</div><div className="font-display text-[26px] font-semibold">{money(material)}</div></div>
        <div className="rounded-app border border-line bg-sunk px-3 py-2.5"><div className="text-[11px] uppercase tracking-[0.06em] text-muted">Component weight</div><div className="font-display text-[26px] font-semibold">{kg(weight)}</div></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 font-display text-[19px] font-semibold">Items to pick for {part.partNo}</h2>
        <label className="flex items-center gap-2 text-xs text-muted">Build qty
          <input className={`${controlClass} w-20 text-right`} type="number" min={1} value={build} onChange={(event) => ops.setBuildQty(Math.max(1, Number(event.target.value) || 1))} />
        </label>
      </div>
      <DataTable>
        <thead><tr><Th>Item code</Th><Th>Ordering no.</Th><Th>Description</Th><Th numeric>Qty / unit</Th><Th numeric>Qty × build</Th><Th numeric>Buy price</Th><Th numeric>Ext. cost</Th><Th numeric>Weight</Th></tr></thead>
        <tbody>
          {leaves.map((leaf) => (
            <tr key={leaf.pid}>
              <Td><TextButton className="font-mono" onClick={() => ops.selectItem(leaf.pid)}>{leaf.part?.partNo || leaf.pid}</TextButton></Td>
              <Td className="font-mono">{leaf.part?.orderNo}</Td>
              <Td>{leaf.part?.description || "Missing item"}</Td>
              <Td numeric>{qfmt(leaf.qty)}</Td>
              <Td numeric>{qfmt(leaf.qty * build)}</Td>
              <Td numeric>{money(buyOf(leaf.pid, ops.data!.prices))}</Td>
              <Td numeric>{money(leaf.qty * build * buyOf(leaf.pid, ops.data!.prices))}</Td>
              <Td numeric>{leaf.part?.weight ? kg(leaf.qty * build * Number(leaf.part.weight)) : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}

function Documents({ id }: { id: string }) {
  const ops = useOps();
  const part = ops.partMap.get(id);
  if (!part || !ops.data) return null;
  const docs = ops.data.docs.filter((doc) => doc.partId === id).sort((a, b) => b.revIndex - a.revIndex);
  return (
    <>
      <Note>Uploads are filed automatically as <span className="font-mono">{part.partNo}-TYPE-Rev#_date-time</span>. Uploading the same type again files the next revision and keeps earlier ones as superseded. Accepted: PDF, PNG, JPG, WEBP, SVG, up to 20 MB.</Note>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
        {DOC_TYPES.map((type) => {
          const list = docs.filter((doc) => doc.type === type.code);
          const current = list[0];
          const next = String.fromCharCode(65 + (current ? current.revIndex + 1 : 0));
          return (
            <div key={type.code} className={`grid content-start gap-2 rounded-app border border-line p-3 ${current ? "bg-surface" : "bg-sunk"}`}>
              <div>
                <h3 className="m-0 font-display text-lg font-semibold">{type.label}</h3>
                <div className="font-mono text-[11.5px] text-muted">{type.code} · {type.hint}</div>
              </div>
              {current ? (
                <>
                  <div className="flex gap-1.5"><span className="rounded-[3px] bg-rev-soft px-1.5 py-px text-[11px] font-semibold text-rev">Rev {current.rev}</span><span className="rounded-[3px] bg-ok-soft px-1.5 py-px text-[11px] font-semibold text-ok uppercase">Current</span></div>
                  <div className="font-mono text-[12.5px] font-medium wrap-break-word">{current.filedName}</div>
                  <Note className="m-0">{when(current.uploadedAt)} · {fileSize(current.sizeBytes)}</Note>
                </>
              ) : <Note className="m-0">No document filed yet.</Note>}
              <label className="cursor-pointer rounded-app border-[1.5px] border-dashed border-line bg-surface px-2.5 py-2.5 text-center text-[12.5px] text-muted">
                Drop file or click to file <strong>Rev {next}</strong>
                <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.svg" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  ops.fileDocument(id, type.code, file);
                  ops.toast(`Filed Rev ${next}`);
                  event.target.value = "";
                }} />
              </label>
              {list.length > 1 ? (
                <details>
                  <summary className="cursor-pointer text-[12.5px] text-muted">Revision history ({list.length})</summary>
                  <ul className="mt-1.5 grid gap-1 text-[12.5px] text-muted">
                    {list.map((doc, index) => <li key={doc.id}>Rev {doc.rev}{index ? " · superseded" : " · current"} · {fmtDate(doc.uploadedAt)}</li>)}
                  </ul>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
