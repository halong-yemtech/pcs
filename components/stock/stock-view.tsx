"use client";

import { Button, TextButton } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { controlClass, SearchInput } from "@/components/ui/field";
import { EmptyState, Note, PageHead, Panel, Tile, Tiles } from "@/components/ui/panel";
import { DataTable, Td, Th } from "@/components/ui/table";
import { LevelTag, StockTag } from "@/components/ui/tag";
import { buyOf, isAsm, marginPct, onHand, sellOf, stockStatus, unitCost } from "@/lib/domain/bom";
import { downloadCsv } from "@/lib/domain/download";
import { money, qfmt, todayISO } from "@/lib/domain/format";
import { LEVELS, LIST_MAX } from "@/lib/domain/types";
import { onOrderQty } from "@/lib/domain/bom";
import { useOps } from "@/components/providers/ops-provider";

export function StockView() {
  const ops = useOps();
  if (!ops.data) return <Panel><EmptyState>Loading…</EmptyState></Panel>;
  const query = ops.stockQuery.toLowerCase();
  const rows = ops.sortedParts.filter((part) => {
    if (ops.stockLevel !== "all" && part.level !== ops.stockLevel) return false;
    if (query && !(part.partNo.toLowerCase().includes(query) || part.orderNo.toLowerCase().includes(query) || part.description.toLowerCase().includes(query))) return false;
    const status = stockStatus(part.id, ops.data!.stock);
    if (ops.stockFilter === "low") return status === "low" || status === "out";
    if (ops.stockFilter === "stocked") return ops.data!.stock[part.id]?.onHand != null;
    if (ops.stockFilter === "noprice") return !buyOf(part.id, ops.data!.prices) || !sellOf(part.id, ops.data!.prices);
    return true;
  });
  let value = 0;
  let low = 0;
  let priced = 0;
  for (const part of ops.data.parts) {
    value += Math.max(0, onHand(part.id, ops.data.stock)) * unitCost(part.id, ops.partMap, ops.data.prices);
    const status = stockStatus(part.id, ops.data.stock);
    if (status === "low" || status === "out") low += 1;
    if (buyOf(part.id, ops.data.prices) && sellOf(part.id, ops.data.prices)) priced += 1;
  }
  const shown = rows.slice(0, LIST_MAX);
  return (
    <Panel>
      <PageHead
        eyebrow="All items"
        title="Stock & prices"
        actions={
          <>
            <Button onClick={() => exportStock(ops, rows.map((part) => part.id))}>Export</Button>
            <Button onClick={() => exportReorder(ops)}>Reorder list</Button>
          </>
        }
      >
        <Tiles>
          <Tile label="Stock value at cost" value={money(value)} />
          <Tile label="Below minimum or out" value={low} warn={low > 0} />
          <Tile label="Items with buy and sell price" value={<>{priced.toLocaleString("en-AU")} <span className="text-[12.5px] font-normal text-muted">of {ops.data.parts.length.toLocaleString("en-AU")}</span></>} />
        </Tiles>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput className="max-w-[340px]" placeholder="Search item code, ordering no. or description" value={ops.stockQuery} onChange={(event) => ops.setStockQuery(event.target.value)} />
          <ChipRow>
            {[["all", "All"], ["low", "Below minimum"], ["stocked", "In stock list"], ["noprice", "Missing a price"]].map(([id, label]) => (
              <Chip key={id} pressed={ops.stockFilter === id} onClick={() => ops.setStockFilter(id)}>{label}</Chip>
            ))}
          </ChipRow>
          <ChipRow>
            {["all", ...LEVELS].map((level) => (
              <Chip key={level} pressed={ops.stockLevel === level} onClick={() => ops.setStockLevel(level)}>{level === "all" ? "All levels" : `${level}s`}</Chip>
            ))}
          </ChipRow>
        </div>
      </PageHead>
      <div className="grid gap-3 px-4 pb-[18px]">
        <Note>Type in a cell and press Tab or Enter to save.</Note>
        <DataTable>
          <thead>
            <tr>
              <Th>Item code</Th><Th>Level</Th><Th>Description</Th><Th numeric>Buy</Th><Th numeric>Sell</Th><Th numeric>Margin</Th><Th numeric>On hand</Th><Th numeric>On order</Th><Th numeric>Min</Th><Th numeric>Reorder qty</Th><Th>Status</Th><Th numeric>Value</Th><Th />
            </tr>
          </thead>
          <tbody>
            {shown.map((part) => {
              const stock = ops.data!.stock[part.id];
              const price = ops.data!.prices[part.id];
              const margin = marginPct(part.id, ops.partMap, ops.data!.prices);
              const ordered = onOrderQty(part.id, ops.data!.pos);
              return (
                <tr key={part.id}>
                  <Td><TextButton className="font-mono" onClick={() => ops.selectItem(part.id, "stock")}>{part.partNo}</TextButton></Td>
                  <Td><LevelTag level={part.level} /></Td>
                  <Td className="max-w-[360px] min-w-[220px] whitespace-normal">{part.description}</Td>
                  <Td numeric><Cell id={part.id} field="buy" value={price?.buy} placeholder={isAsm(part) ? unitCost(part.id, ops.partMap, ops.data!.prices).toFixed(2) : ""} /></Td>
                  <Td numeric><Cell id={part.id} field="sell" value={price?.sell} /></Td>
                  <Td numeric>{margin == null ? "—" : <span className={margin < 0 ? "text-bad" : ""}>{margin.toFixed(1)}%</span>}</Td>
                  <Td numeric>{stock?.onHand != null ? qfmt(stock.onHand) : "—"}</Td>
                  <Td numeric>{ordered ? qfmt(ordered) : ""}</Td>
                  <Td numeric><Cell id={part.id} field="min" value={stock?.min} /></Td>
                  <Td numeric><Cell id={part.id} field="reorder" value={stock?.reorder} /></Td>
                  <Td><StockTag status={stockStatus(part.id, ops.data!.stock)} /></Td>
                  <Td numeric>{stock?.onHand ? money(Math.max(0, onHand(part.id, ops.data!.stock)) * unitCost(part.id, ops.partMap, ops.data!.prices)) : ""}</Td>
                  <Td className="whitespace-nowrap">
                    <Button size="sm" title="Receive" onClick={() => ops.openModal({ type: "stock-move", id: part.id, move: "receive" })}>+</Button>{" "}
                    <Button size="sm" title="Issue" onClick={() => ops.openModal({ type: "stock-move", id: part.id, move: "issue" })}>−</Button>{" "}
                    <Button size="sm" title="Stock count" onClick={() => ops.openModal({ type: "stock-move", id: part.id, move: "adjust" })}>=</Button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
        {rows.length > LIST_MAX ? <Note>Showing {LIST_MAX} of {rows.length.toLocaleString("en-AU")} items. Search or filter to narrow the list.</Note> : null}
      </div>
    </Panel>
  );
}

function Cell({ id, field, value, placeholder }: { id: string; field: "buy" | "sell" | "min" | "reorder"; value?: number | null; placeholder?: string }) {
  const ops = useOps();
  return (
    <input
      className={`${controlClass} w-[86px] px-1.5 py-1 text-right`}
      type="number"
      min={0}
      step="any"
      defaultValue={value ?? ""}
      placeholder={placeholder}
      aria-label={`${field} for ${ops.partMap.get(id)?.partNo || id}`}
      onBlur={(event) => {
        const next = event.target.value === "" ? null : Number(event.target.value);
        if (field === "buy" || field === "sell") ops.setPrice(id, { [field]: next }, field === "buy" ? "Edited in the stock list" : undefined);
        else ops.setStock(id, { [field]: next });
        ops.toast("Saved");
      }}
    />
  );
}

function exportStock(ops: ReturnType<typeof useOps>, ids: string[]) {
  const rows: (string | number)[][] = [["Item code", "Ordering no.", "Level", "Description", "Buy price", "Sell price", "On hand", "Min level"]];
  for (const id of ids) {
    const part = ops.partMap.get(id);
    if (!part || !ops.data) continue;
    rows.push([part.partNo, part.orderNo, part.level, part.description, ops.data.prices[id]?.buy ?? "", ops.data.prices[id]?.sell ?? "", ops.data.stock[id]?.onHand ?? "", ops.data.stock[id]?.min ?? ""]);
  }
  downloadCsv(`stock-and-prices_${todayISO()}.csv`, rows);
  ops.toast("Stock exported");
}

function exportReorder(ops: ReturnType<typeof useOps>) {
  const rows: (string | number)[][] = [["Item code", "Description", "On hand", "Min", "Order qty", "Buy price"]];
  if (!ops.data) return;
  for (const part of ops.sortedParts) {
    const status = stockStatus(part.id, ops.data.stock);
    if (status !== "low" && status !== "out") continue;
    const stock = ops.data.stock[part.id];
    const need = Math.max(0, Math.max(stock?.reorder || 0, (stock?.min || 0) - onHand(part.id, ops.data.stock)));
    rows.push([part.partNo, part.description, onHand(part.id, ops.data.stock), stock?.min ?? "", need, buyOf(part.id, ops.data.prices)]);
  }
  downloadCsv(`reorder-list_${todayISO()}.csv`, rows);
  ops.toast("Reorder list exported");
}
