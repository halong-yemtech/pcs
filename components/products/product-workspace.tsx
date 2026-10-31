"use client";

import { Button, TextButton } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { SelectInput } from "@/components/ui/field";
import { EmptyState, Note, Panel, Tile, Tiles } from "@/components/ui/panel";
import { DataTable, Td, Th } from "@/components/ui/table";
import { LevelTag, TempTag } from "@/components/ui/tag";
import { compareVariants, filled, isAsm, lines } from "@/lib/domain/bom";
import { modApplies, modOk, modulesOf, prodWidth } from "@/lib/domain/catalog";
import { num, qfmt, shortMat } from "@/lib/domain/format";
import { LEVELS, MOD_ROLES } from "@/lib/domain/types";
import { useOps } from "@/components/providers/ops-provider";

export function ProductWorkspace() {
  const ops = useOps();
  if (!ops.ready) return <Panel><EmptyState>Loading the product database…</EmptyState></Panel>;
  const product = ops.productId ? ops.productMap.get(ops.productId) : undefined;
  if (!product) return <Panel><EmptyState title="Pick a product type">Choose a product type from the list to allocate its components for every belt width and version.</EmptyState></Panel>;
  const stats = filled(product, ops.partMap);
  const materials = [...new Set(product.variantIds.map((id) => ops.partMap.get(id)?.material || "").filter(Boolean))];
  const temp = product.variantIds.map((id) => ops.partMap.get(id)).filter((part) => part?.tempCode).length;
  return (
    <Panel>
      <div className="grid gap-3 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-muted">
              {product.category}
              {product.sourcePage ? ` · catalogue page ${product.sourcePage}` : ""}
            </div>
            {temp ? <div className="mt-1.5 rounded-app bg-rev-soft px-2.5 py-2 text-[13px] text-rev">{temp} variant{temp > 1 ? "s have" : " has"} a temporary item code. Open a variant and use Edit details to enter its real code.</div> : null}
            <h1 className="m-0 font-display text-[30px] font-semibold leading-[1.05]">{product.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => ops.openModal({ type: "product", id: product.id })}>Edit product type</Button>
            <Button onClick={() => ops.toast("Matrix export is ready from the catalogue workbook.")}>Export matrix</Button>
            <Button onClick={() => ops.toast("BOM export lists every variant on this product type.")}>Export all BOMs</Button>
          </div>
        </div>
        {product.notes ? <Note>{product.notes}</Note> : null}
        <Tiles>
          <Tile label="Variants (item codes)" value={stats.n} />
          <Tile label="With components allocated" value={<>{stats.done} <span className="text-[12.5px] font-normal text-muted">of {stats.n}</span></>} />
          <Tile label="Spare parts linked" value={product.spareIds.length} />
          <Tile label="Versions" value={<span className="font-sans text-sm font-semibold">{materials.map((material) => material || "Standard").join(" · ") || "—"}</span>} />
        </Tiles>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-line px-3" role="tablist">
        {(
          [
            ["matrix", "Component matrix"],
            ["variants", `Variants & specs (${product.variantIds.length})`],
            ["build", "Parts to build"],
            ["spares", `Spare parts (${product.spareIds.length})`],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={ops.productTab === id} onClick={() => ops.setProductTab(id)} className={`-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-3 py-2.5 font-medium whitespace-nowrap ${ops.productTab === id ? "border-accent text-ink" : "border-transparent text-muted"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-3.5 px-4 py-3.5">
        {ops.productTab === "matrix" ? <Matrix /> : null}
        {ops.productTab === "variants" ? <Variants /> : null}
        {ops.productTab === "build" ? <BuildList /> : null}
        {ops.productTab === "spares" ? <Spares /> : null}
      </div>
    </Panel>
  );
}

function Matrix() {
  const ops = useOps();
  const product = ops.productMap.get(ops.productId || "");
  if (!product) return null;
  const materials = [...new Set(product.variantIds.map((id) => ops.partMap.get(id)?.material || ""))];
  let variants = product.variantIds.map((id) => ops.partMap.get(id)).filter((part) => !!part);
  if (ops.material !== "all") variants = variants.filter((part) => (part.material || "") === ops.material);
  variants = [...variants].sort(compareVariants);
  const cols = product.attrCols.filter((col) => !/tip width|pole length|weigh/i.test(col)).slice(0, 2);
  const mw = modApplies(product) ? product.moduleWidth : 0;
  const hasWidth = variants.some((part) => prodWidth(part));
  const widths = [[0, "Not modular"], [100, "100 mm"], [150, "150 mm (secondary)"], [200, "200 mm (primary)"], [250, "250 mm"], [300, "300 mm"]] as const;
  return (
    <>
      {mw || modApplies(product) ? (
        <div className="flex flex-wrap items-center gap-3 rounded-app border border-line bg-sunk px-3 py-2.5">
          <label className="flex items-center gap-2 text-xs text-muted">
            Module width
            <SelectInput className="w-auto" value={String(mw)} onChange={(event) => ops.patchProduct(product.id, { moduleWidth: num(event.target.value) })}>
              {widths.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              {widths.some(([value]) => value === mw) ? null : <option value={mw}>{mw} mm</option>}
            </SelectInput>
          </label>
          <Note className="m-0">{mw ? `Modules = product (tip) width ÷ ${mw} mm. Tips, arms and cushions are set per module and multiplied by each variant’s module count; everything else is per product.` : "Set a module width so tips, arms and cushions are calculated from the number of modules."}</Note>
        </div>
      ) : null}
      <Note>Each row is a variant with its own item code. Click a cell to choose the parts for that role and set the quantity.</Note>
      {materials.filter(Boolean).length > 1 ? (
        <ChipRow>
          <Chip pressed={ops.material === "all"} onClick={() => ops.setMaterial("all")}>All versions</Chip>
          {materials.filter((material) => material !== undefined).map((material) => (
            <Chip key={material || "standard"} pressed={ops.material === material} onClick={() => ops.setMaterial(material)}>{material || "Standard"}</Chip>
          ))}
        </ChipRow>
      ) : null}
      <div className="max-h-[70vh] overflow-auto rounded-app border border-line">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <Th className="sticky top-0 left-0 z-[3]">Item code</Th>
              <Th className="sticky top-0 z-[2]">Ordering no.</Th>
              <Th numeric className="sticky top-0 z-[2]">Belt width</Th>
              {hasWidth ? <Th numeric className="sticky top-0 z-[2]">Product width</Th> : null}
              {mw ? <Th numeric className="sticky top-0 z-[2]">Modules</Th> : null}
              {cols.map((col) => <Th key={col} className="sticky top-0 z-[2]">{col.replace(/\s*\(.*?\)/, "")}</Th>)}
              <Th className="sticky top-0 z-[2]">Version</Th>
              {product.roles.map((role) => (
                <Th key={role} className="sticky top-0 z-[2] min-w-[118px]">
                  {role}
                  {mw && MOD_ROLES.includes(role) ? <span className="font-normal tracking-normal normal-case"> /module</span> : null}
                </Th>
              ))}
              <Th numeric className="sticky top-0 z-[2]">Weight</Th>
            </tr>
          </thead>
          <tbody>
            {variants.map((part) => {
              const partLines = lines(part);
              const modules = modulesOf(product, part);
              return (
                <tr key={part.id}>
                  <Td className="sticky left-0 z-[1] border-r border-line bg-surface">
                    <TextButton className="font-mono" onClick={() => ops.selectItem(part.id)}>{part.partNo}</TextButton>
                    {part.tempCode ? <> <TempTag /></> : null}
                  </Td>
                  <Td className="font-mono text-muted">{part.orderNo}</Td>
                  <Td numeric>{part.width ?? ""}</Td>
                  {hasWidth ? <Td numeric>{prodWidth(part) ?? ""}</Td> : null}
                  {mw ? <Td numeric>{modules == null ? "—" : modOk(modules) ? modules : <span className="text-bad" title={`Product width is not a whole number of ${mw} mm modules`}>{qfmt(modules)}</span>}</Td> : null}
                  {cols.map((col) => <Td key={col}>{part.attrs[col] || ""}</Td>)}
                  <Td>{shortMat(part.material) || "—"}</Td>
                  {product.roles.map((role) => {
                    const roleLines = partLines.filter((line) => (line.role || "Accessories") === role);
                    return (
                      <Td key={role} className={`min-w-[118px] cursor-pointer border-l border-line align-top ${roleLines.length ? "bg-ok-soft" : ""}`}>
                        <button type="button" className="w-full bg-transparent p-0 text-left" onClick={() => ops.openModal({ type: "cell", productId: product.id, variantId: part.id, role })}>
                          {roleLines.length ? roleLines.map((line) => (
                            <div key={line.partId + line.i}><span className="font-mono">{ops.partMap.get(line.partId)?.partNo || line.partId}</span> <strong>×{qfmt(line.qty)}</strong></div>
                          )) : <span className="text-muted">+</span>}
                        </button>
                      </Td>
                    );
                  })}
                  <Td numeric className="text-muted">{part.weight ? `${part.weight} kg` : ""}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Variants() {
  const ops = useOps();
  const product = ops.productMap.get(ops.productId || "");
  if (!product) return null;
  const variants = product.variantIds.map((id) => ops.partMap.get(id)).filter((part) => !!part).sort(compareVariants);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Note className="m-0">Every variant is its own item with its own item code. Edit specs here; the component matrix uses the same variants.</Note>
        <Button tone="primary" onClick={() => ops.openModal({ type: "item" })}>+ Add variant</Button>
      </div>
      {!variants.length ? <EmptyState title="No variants yet">Add each belt width and version as a variant with its own item code.</EmptyState> : (
        <DataTable>
          <thead>
            <tr>
              <Th>Item code</Th><Th>Ordering no.</Th><Th numeric>Belt width</Th><Th>Version</Th>
              {product.attrCols.map((col) => <Th key={col}>{col}</Th>)}
              <Th numeric>Weight</Th><Th>Docs</Th><Th />
            </tr>
          </thead>
          <tbody>
            {variants.map((part) => {
              const docs = new Set((ops.data?.docs || []).filter((doc) => doc.partId === part.id).map((doc) => doc.type));
              return (
                <tr key={part.id}>
                  <Td><TextButton className="font-mono" onClick={() => ops.selectItem(part.id)}>{part.partNo}</TextButton>{part.tempCode ? <> <TempTag /></> : null}</Td>
                  <Td className="font-mono text-muted">{part.orderNo}</Td>
                  <Td numeric>{part.width ?? ""}</Td>
                  <Td>{part.material}</Td>
                  {product.attrCols.map((col) => <Td key={col}>{part.attrs[col] || ""}</Td>)}
                  <Td numeric>{part.weight}</Td>
                  <Td>
                    <span className="flex gap-0.5">
                      {["GA", "MFR", "IIOM"].map((type) => <span key={type} className={`rounded-[3px] border px-1 py-px text-[10px] font-bold ${docs.has(type) ? "border-transparent bg-ok-soft text-ok" : "border-line text-muted"}`}>{type}</span>)}
                    </span>
                  </Td>
                  <Td><Button size="sm" onClick={() => ops.openModal({ type: "item", id: part.id })}>Edit</Button></Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </>
  );
}

function BuildList() {
  const ops = useOps();
  const product = ops.productMap.get(ops.productId || "");
  if (!product) return null;
  const map = new Map<string, { id: string; variants: number }>();
  for (const id of product.variantIds) {
    const walk = (partId: string, seen: Set<string>) => {
      const part = ops.partMap.get(partId);
      if (!part || seen.has(partId)) return;
      seen.add(partId);
      for (const line of lines(part)) {
        const entry = map.get(line.partId) || { id: line.partId, variants: 0 };
        if (!map.has(line.partId)) map.set(line.partId, entry);
        walk(line.partId, seen);
      }
    };
    const seen = new Set<string>();
    const part = ops.partMap.get(id);
    if (part) {
      for (const line of lines(part)) {
        const entry = map.get(line.partId) || { id: line.partId, variants: 0 };
        entry.variants += 1;
        map.set(line.partId, entry);
        walk(line.partId, seen);
      }
    }
  }
  const rows = [...map.values()].map((entry) => ({ ...entry, part: ops.partMap.get(entry.id) })).filter((entry) => entry.part);
  if (!rows.length) return <EmptyState>Nothing allocated yet. Fill in the component matrix first; every Part and Component you use will be listed here so you can build its own BOM.</EmptyState>;
  const needs = rows.filter((entry) => entry.part && (entry.part.level === "Part" || entry.part.level === "Component") && !isAsm(entry.part));
  return (
    <>
      <Note>Every Part, Component and Item used anywhere in {product.name}, across all {product.variantIds.length} variants. Parts are made of Components and Components are made of Items.</Note>
      {needs.length ? <div className="rounded-app bg-rev-soft px-2.5 py-2 text-[13px] text-rev">{needs.length} part{needs.length > 1 ? "s" : ""} or component{needs.length > 1 ? "s" : ""} still need a BOM.</div> : null}
      <DataTable>
        <thead><tr><Th>Item code</Th><Th>Level</Th><Th>Description</Th><Th>Ordering no.</Th><Th numeric>In variants</Th><Th>Own BOM</Th></tr></thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.id}>
              <Td><TextButton className="font-mono" onClick={() => ops.selectItem(entry.id)}>{entry.part?.partNo}</TextButton></Td>
              <Td><LevelTag level={entry.part?.level} /></Td>
              <Td>{entry.part?.description}</Td>
              <Td className="font-mono text-muted">{entry.part?.orderNo}</Td>
              <Td numeric>{entry.variants}</Td>
              <Td>{entry.part && isAsm(entry.part) ? <span className="rounded-[3px] bg-ok-soft px-1.5 py-px text-[11px] font-semibold text-ok uppercase">{lines(entry.part).length} lines</span> : needs.some((item) => item.id === entry.id) ? <span className="rounded-[3px] bg-rev-soft px-1.5 py-px text-[11px] font-semibold text-rev uppercase">Needs BOM</span> : <span className="text-muted">—</span>}</Td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}

function Spares() {
  const ops = useOps();
  const product = ops.productMap.get(ops.productId || "");
  if (!product) return null;
  const spares = product.spareIds.map((id) => ops.partMap.get(id)).filter((part) => !!part).sort((a, b) => product.roles.indexOf(a.role) - product.roles.indexOf(b.role) || a.partNo.localeCompare(b.partNo, undefined, { numeric: true }));
  return (
    <>
      {!spares.length ? <EmptyState>No spare parts are linked to this product type yet.</EmptyState> : (
        <>
          <Note>The role decides which matrix column a part is offered in first.</Note>
          <DataTable>
            <thead><tr><Th>Item code</Th><Th>Ordering no.</Th><Th>Description</Th><Th numeric>Width</Th><Th>Version</Th><Th>Level</Th><Th>Role</Th><Th numeric>Used in</Th></tr></thead>
            <tbody>
              {spares.map((part) => (
                <tr key={part.id}>
                  <Td><TextButton className="font-mono" onClick={() => ops.selectItem(part.id)}>{part.partNo}</TextButton></Td>
                  <Td className="font-mono text-muted">{part.orderNo}</Td>
                  <Td>{part.description.split(" · ")[0]}</Td>
                  <Td numeric>{part.width ?? ""}</Td>
                  <Td>{shortMat(part.material)}</Td>
                  <Td>
                    <SelectInput className="w-auto" aria-label="Level" value={part.level} onChange={(event) => ops.patchPart(part.id, { level: event.target.value })}>
                      <option value="">—</option>
                      {LEVELS.map((level) => <option key={level}>{level}</option>)}
                    </SelectInput>
                  </Td>
                  <Td>
                    <SelectInput className="w-auto" aria-label="Role" value={part.role || "Accessories"} onChange={(event) => ops.patchPart(part.id, { role: event.target.value })}>
                      {[...new Set([...product.roles, part.role || "Accessories"])].map((role) => <option key={role}>{role}</option>)}
                    </SelectInput>
                  </Td>
                  <Td numeric>{ops.usedBy.get(part.id)?.length || ""}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}
    </>
  );
}
