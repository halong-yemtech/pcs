"use client";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/panel";
import { LevelTag, TempTag } from "@/components/ui/tag";
import { SearchInput } from "@/components/ui/field";
import { filled, isAsm } from "@/lib/domain/bom";
import { LIST_MAX } from "@/lib/domain/types";
import type { ReactNode } from "react";
import { useOps } from "@/components/providers/ops-provider";

export function SideList() {
  const ops = useOps();
  const productsView = ops.view === "products";
  const query = (productsView ? ops.productQuery : ops.itemQuery).toLowerCase();

  let body: ReactNode;
  if (!ops.ready || !ops.data) {
    body = <EmptyState>Loading…</EmptyState>;
  } else if (productsView) {
    const products = ops.data.products.filter((product) => !query || (product.name + " " + product.category).toLowerCase().includes(query));
    const categories: string[] = [];
    for (const product of products) if (!categories.includes(product.category)) categories.push(product.category);
    body = products.length ? (
      <>
        <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2">
          <Button size="sm" tone="primary" onClick={() => ops.openModal({ type: "product" })}>+ New product type</Button>
          <Button size="sm" onClick={() => ops.toast("Spreadsheet import uses the same columns as the catalogue template.")}>Import items</Button>
          <Button size="sm" onClick={() => ops.toast("The import template is the catalogue workbook.")}>Template</Button>
        </div>
        {categories.map((category) => (
          <div key={category}>
            <div className="sticky top-0 z-[1] border-b border-line bg-sunk px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{category}</div>
            {products.filter((product) => product.category === category).map((product) => {
              const stats = filled(product, ops.partMap);
              const tone = stats.done ? (stats.done === stats.n ? "bg-ok-soft text-ok" : "bg-rev-soft text-rev") : "border-line bg-sunk text-muted";
              return (
                <button
                  key={product.id}
                  type="button"
                  aria-current={product.id === ops.productId}
                  onClick={() => ops.selectProduct(product.id)}
                  className={`ease-ui grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 border-b border-l-[3px] border-r-0 border-t-0 px-3 py-[9px] text-left ${product.id === ops.productId ? "border-l-accent bg-accent-soft" : "border-l-transparent hover:bg-sunk"}`}
                >
                  <span className="font-semibold">{product.name}</span>
                  <span className={`rounded-[3px] border border-transparent px-1.5 py-px text-[11px] font-semibold ${tone}`} title="Variants with components allocated">{stats.done}/{stats.n}</span>
                  <span className="col-span-2 truncate text-[13px] text-muted">{stats.n} variants · {product.spareIds.length} spare parts{product.custom ? " · added in register" : ""}</span>
                </button>
              );
            })}
          </div>
        ))}
      </>
    ) : (
      <EmptyState title="No product types">{query ? "No product types match." : "Load your product database to create them."}</EmptyState>
    );
  } else {
    const rows = ops.sortedParts.filter((part) => {
      if (query && !(part.partNo.toLowerCase().includes(query) || part.orderNo.toLowerCase().includes(query) || part.description.toLowerCase().includes(query))) return false;
      if (ops.itemFilter === "bom") return isAsm(part);
      if (ops.itemFilter !== "all") return part.level === ops.itemFilter;
      return true;
    });
    body = !ops.data.parts.length ? (
      <EmptyState title="No items yet">Use “+ New item” to add one.</EmptyState>
    ) : !rows.length ? (
      <EmptyState>No items match.</EmptyState>
    ) : (
      <>
        {rows.slice(0, LIST_MAX).map((part) => (
          <button
            key={part.id}
            type="button"
            aria-current={part.id === ops.selectedId}
            onClick={() => ops.selectItem(part.id)}
            className={`ease-ui grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 border-b border-l-[3px] border-r-0 border-t-0 px-3 py-[9px] text-left ${part.id === ops.selectedId ? "border-l-accent bg-accent-soft" : "border-l-transparent hover:bg-sunk"}`}
          >
            <span className="font-mono text-[12.5px] font-medium">
              {part.partNo} <span className="text-muted">{part.orderNo}</span>
              {part.tempCode ? <> <TempTag /></> : null}
            </span>
            <span className="flex flex-nowrap gap-1">
              <LevelTag level={part.level} />
              {isAsm(part) ? <span className="inline-block rounded-[3px] bg-accent px-1.5 py-px text-[11px] font-semibold text-accent-ink uppercase">BOM</span> : null}
            </span>
            <span className="col-span-2 truncate text-[13px] text-muted">{part.description}</span>
          </button>
        ))}
        {rows.length > LIST_MAX ? <EmptyState>Showing {LIST_MAX} of {rows.length.toLocaleString("en-AU")} items. Search to narrow the list.</EmptyState> : null}
      </>
    );
  }

  return (
    <aside className="flex max-h-[360px] min-w-0 flex-col overflow-hidden rounded-app border border-line bg-surface min-[861px]:sticky min-[861px]:top-[76px] min-[861px]:max-h-[calc(100vh-110px)]">
      <div className="grid gap-2 border-b border-line p-3">
        <SearchInput
          value={productsView ? ops.productQuery : ops.itemQuery}
          aria-label={productsView ? "Search product types" : "Search items"}
          placeholder={productsView ? "Search product types" : "Search item code, ordering no. or description"}
          onChange={(event) => (productsView ? ops.setProductQuery(event.target.value) : ops.setItemQuery(event.target.value))}
        />
        {productsView ? null : (
          <div className="flex flex-wrap gap-1.5">
            {[["all", "All"], ["Product", "Products"], ["Part", "Parts"], ["Component", "Components"], ["Item", "Items"], ["bom", "With BOM"]].map(([id, label]) => (
              <Chip key={id} pressed={ops.itemFilter === id} onClick={() => ops.setItemFilter(id)}>{label}</Chip>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{body}</div>
    </aside>
  );
}
