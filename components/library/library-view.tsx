"use client";

import { Button, TextButton } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { SearchInput, SelectInput } from "@/components/ui/field";
import { EmptyState, Note, PageHead, Panel, Tile, Tiles } from "@/components/ui/panel";
import { DataTable, Td, Th } from "@/components/ui/table";
import { LevelTag } from "@/components/ui/tag";
import { downloadCsv } from "@/lib/domain/download";
import { fileSize, todayISO, when } from "@/lib/domain/format";
import { DOC_TYPES, LEVELS, LIST_MAX } from "@/lib/domain/types";
import { useOps } from "@/components/providers/ops-provider";

export function LibraryView() {
  const ops = useOps();
  if (!ops.data) return <Panel><EmptyState>Loading…</EmptyState></Panel>;
  const docs = ops.data.docs;
  const withAny = new Set(docs.map((doc) => doc.partId)).size;
  const current = docs.filter((doc) => {
    const latest = docs.filter((other) => other.partId === doc.partId && other.type === doc.type).sort((a, b) => b.revIndex - a.revIndex)[0];
    return latest?.id === doc.id;
  }).length;
  const query = ops.libQuery.toLowerCase();
  const items = ops.sortedParts.filter((part) => {
    if (ops.libLevel !== "all" && part.level !== ops.libLevel) return false;
    const filed = new Set(docs.filter((doc) => doc.partId === part.id).map((doc) => doc.type));
    if (ops.libMiss === "has" && !filed.size) return false;
    if (ops.libMiss === "none" && filed.size) return false;
    if (["GA", "MFR", "IIOM"].includes(ops.libMiss) && filed.has(ops.libMiss)) return false;
    if (query && ![part.partNo, part.orderNo, part.description].some((value) => value.toLowerCase().includes(query))) return false;
    return true;
  });
  const shown = items.slice(0, LIST_MAX);
  const selected = ops.libSelected ? ops.partMap.get(ops.libSelected) : undefined;
  const docQuery = ops.libDocQuery.toLowerCase();
  const filedDocs = docs.filter((doc) => (ops.libType === "all" || doc.type === ops.libType) && (!docQuery || `${doc.filedName} ${ops.partMap.get(doc.partId)?.partNo || ""} ${doc.originalName}`.toLowerCase().includes(docQuery)));
  return (
    <Panel>
      <PageHead
        eyebrow="GA drawings · manufacturer’s drawings · IIOM manuals · other"
        title="Document library"
        actions={
          <>
            <Button tone="primary" onClick={() => ops.openModal({ type: "item" })}>+ New item for documents</Button>
            <Button onClick={() => { downloadCsv(`document-register_${todayISO()}.csv`, [["Filed name", "Item", "Type", "Rev"], ...docs.map((doc) => [doc.filedName, ops.partMap.get(doc.partId)?.partNo || "", doc.type, doc.rev])]); ops.toast("Register downloaded"); }}>Download register CSV</Button>
          </>
        }
      >
        <Tiles>
          <Tile label="Documents filed" value={docs.length} note={`${current} current revisions`} />
          <Tile label="Items with documents" value={<>{withAny.toLocaleString("en-AU")} <span className="text-[12.5px] font-normal text-muted">of {ops.data.parts.length.toLocaleString("en-AU")}</span></>} />
          {DOC_TYPES.slice(0, 3).map((type) => (
            <Tile key={type.code} label={`${type.label} filed`} value={new Set(docs.filter((doc) => doc.type === type.code).map((doc) => doc.partId)).size} />
          ))}
        </Tiles>
      </PageHead>
      <div className="grid border-t border-line min-[861px]:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex max-h-[420px] min-w-0 flex-col border-b border-line min-[861px]:max-h-[70vh] min-[861px]:border-r min-[861px]:border-b-0">
          <div className="grid gap-2 border-b border-line p-3">
            <SearchInput placeholder="Filter items: code, ordering no., description" aria-label="Filter items" value={ops.libQuery} onChange={(event) => ops.setLibQuery(event.target.value)} />
            <ChipRow>
              {["all", ...LEVELS].map((level) => <Chip key={level} pressed={ops.libLevel === level} onClick={() => ops.setLibLevel(level)}>{level === "all" ? "All levels" : `${level}s`}</Chip>)}
            </ChipRow>
            <SelectInput aria-label="Document status" value={ops.libMiss} onChange={(event) => ops.setLibMiss(event.target.value)}>
              <option value="all">Any document status</option>
              <option value="has">Has documents</option>
              <option value="none">No documents yet</option>
              <option value="GA">Missing GA drawing</option>
              <option value="MFR">Missing manufacturer’s drawing</option>
              <option value="IIOM">Missing IIOM manual</option>
            </SelectInput>
            <Note className="m-0">{items.length.toLocaleString("en-AU")} item{items.length === 1 ? "" : "s"}{items.length > LIST_MAX ? `, showing first ${LIST_MAX}` : ""}</Note>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {shown.map((part) => {
              const filed = new Set(docs.filter((doc) => doc.partId === part.id).map((doc) => doc.type));
              return (
                <button key={part.id} type="button" aria-current={part.id === ops.libSelected} onClick={() => ops.setLibSelected(part.id)} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 border-b border-l-[3px] border-r-0 border-t-0 px-3 py-[9px] text-left ${part.id === ops.libSelected ? "border-l-accent bg-accent-soft" : "border-l-transparent hover:bg-sunk"}`}>
                  <span className="font-mono text-[12.5px] font-medium">{part.partNo} <span className="text-muted">{part.orderNo}</span></span>
                  <span className="flex gap-0.5">{["GA", "MFR", "IIOM"].map((type) => <span key={type} className={`rounded-[3px] border px-1 text-[10px] font-bold ${filed.has(type) ? "border-transparent bg-ok-soft text-ok" : "border-line text-muted"}`}>{type === "MFR" ? "MFR" : type}</span>)}</span>
                  <span className="col-span-2 truncate text-[13px] text-muted">{part.description}</span>
                </button>
              );
            })}
            {!shown.length ? <EmptyState>No items match these filters.</EmptyState> : null}
          </div>
        </aside>
        <div className="grid content-start gap-3.5 p-4">
          {selected ? (
            <>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-muted">Item code <strong className="font-mono text-ink">{selected.partNo}</strong>{selected.orderNo ? ` · ${selected.orderNo}` : ""} </div>
                  <h2 className="m-0 font-display text-[22px] font-semibold">{selected.description}</h2>
                  <LevelTag level={selected.level} />
                </div>
                <Button size="sm" onClick={() => ops.selectItem(selected.id, "documents")}>Open item</Button>
              </div>
              <Note>Pick a file in the item’s Documents tab to file the next revision. The slots below show what is already on file.</Note>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
                {DOC_TYPES.map((type) => {
                  const filed = docs.filter((doc) => doc.partId === selected.id && doc.type === type.code).sort((a, b) => b.revIndex - a.revIndex)[0];
                  return (
                    <div key={type.code} className={`rounded-app border border-line p-3 ${filed ? "bg-surface" : "bg-sunk"}`}>
                      <div className="font-display text-lg font-semibold">{type.label}</div>
                      <div className="text-[12.5px] text-muted">{filed ? `Rev ${filed.rev} · ${filed.filedName}` : "No document filed yet."}</div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState title="Pick an item to file documents">Filter the item list on the left, pick the item, then file its GA drawing, manufacturer’s drawing or IIOM manual.</EmptyState>
          )}
        </div>
      </div>
      <div className="grid gap-3 border-t border-line px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 font-display text-[19px] font-semibold">All filed documents</h2>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput className="max-w-[320px]" placeholder="Search filed name, item or original file name" value={ops.libDocQuery} onChange={(event) => ops.setLibDocQuery(event.target.value)} />
            <ChipRow>
              <Chip pressed={ops.libType === "all"} onClick={() => ops.setLibType("all")}>All types</Chip>
              {DOC_TYPES.map((type) => <Chip key={type.code} pressed={ops.libType === type.code} onClick={() => ops.setLibType(type.code)}>{type.label}</Chip>)}
            </ChipRow>
          </div>
        </div>
        {!filedDocs.length ? <Note>No documents filed yet.</Note> : (
          <DataTable maxHeight="50vh">
            <thead><tr><Th>Filed name</Th><Th>Item</Th><Th>Type</Th><Th>Rev</Th><Th>Status</Th><Th>Filed</Th><Th numeric>Size</Th><Th>Original file</Th></tr></thead>
            <tbody>
              {filedDocs.map((doc) => {
                const latest = docs.filter((other) => other.partId === doc.partId && other.type === doc.type).sort((a, b) => b.revIndex - a.revIndex)[0];
                const part = ops.partMap.get(doc.partId);
                return (
                  <tr key={doc.id}>
                    <Td className="font-mono">{doc.filedName}</Td>
                    <Td>{part ? <TextButton className="font-mono" onClick={() => ops.setLibSelected(part.id)}>{part.partNo}</TextButton> : <span className="text-muted">deleted</span>}</Td>
                    <Td>{DOC_TYPES.find((type) => type.code === doc.type)?.label || doc.type}</Td>
                    <Td><span className="rounded-[3px] bg-rev-soft px-1.5 py-px font-mono text-[11px] font-semibold text-rev">{doc.rev}</span></Td>
                    <Td>{latest?.id === doc.id ? <span className="rounded-[3px] bg-ok-soft px-1.5 py-px text-[11px] font-semibold text-ok uppercase">Current</span> : <span className="rounded-[3px] border border-line px-1.5 py-px text-[11px] font-semibold text-muted uppercase">Superseded</span>}</Td>
                    <Td className="text-muted whitespace-nowrap">{when(doc.uploadedAt)}</Td>
                    <Td numeric className="text-muted">{fileSize(doc.sizeBytes)}</Td>
                    <Td className="max-w-[220px] text-muted wrap-break-word">{doc.originalName}</Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </div>
    </Panel>
  );
}
