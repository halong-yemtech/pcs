"use client";

import { useState } from "react";
import { AttentionTable } from "@/components/attention/attention-table";
import { CompanyModal } from "@/components/modals/company-modal";
import { DealModal } from "@/components/modals/deal-modal";
import { ExpenseModal } from "@/components/modals/expense-modal";
import { ItemModal } from "@/components/modals/item-modal";
import { LeadModal } from "@/components/modals/lead-modal";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { DataTable, Td, Th } from "@/components/ui/table";
import { fmtDate, money, qfmt } from "@/lib/domain/format";
import { PO_LABEL } from "@/lib/domain/types";
import { useOps } from "@/components/providers/ops-provider";

export function ModalHost() {
  const ops = useOps();
  const modal = ops.modal;
  if (!modal) return null;
  if (modal.type === "company") return <CompanyModal />;
  if (modal.type === "item") return <ItemModal id={modal.id} />;
  if (modal.type === "lead") return <LeadModal />;
  if (modal.type === "deal") return <DealModal id={modal.id} />;
  if (modal.type === "expense") return <ExpenseModal id={modal.id} saleId={modal.saleId} />;
  if (modal.type === "attention") return <AttentionModal />;
  if (modal.type === "customer") return <CustomerModal id={modal.id} />;
  if (modal.type === "supplier") return <SupplierModal id={modal.id} />;
  if (modal.type === "po") return <PoModal id={modal.id} />;
  if (modal.type === "product") return <ProductModal id={modal.id} />;
  if (modal.type === "cell") return <CellModal productId={modal.productId} variantId={modal.variantId} role={modal.role} />;
  if (modal.type === "stock-move") return <StockMoveModal id={modal.id} move={modal.move} />;
  return null;
}

function AttentionModal() {
  const ops = useOps();
  return (
    <Modal wide title="Needs attention" eyebrow="Stuck sales, approvals, overdue builds, RFQs and deliveries" onClose={ops.closeModal} footer={<div className="flex justify-end"><Button onClick={ops.closeModal}>Close</Button></div>}>
      <AttentionTable items={ops.attention} />
      <p className="m-0 text-[12.5px] text-muted">A summary of these items is prepared each morning at 07:00 Australia/Perth. The list is evaluated by the attention Edge function.</p>
    </Modal>
  );
}

function CustomerModal({ id }: { id?: string }) {
  const ops = useOps();
  const existing = ops.data?.customers.find((customer) => customer.id === id);
  const [name, setName] = useState(existing?.name || "");
  const [site, setSite] = useState(existing?.site || "");
  const [phone, setPhone] = useState(existing?.contacts[0]?.phone || "");
  const [contact, setContact] = useState(existing?.contacts[0]?.name || "");
  return (
    <Modal title={existing ? existing.name : "New customer"} onClose={ops.closeModal} footer={<div className="flex justify-end gap-2"><Button onClick={ops.closeModal}>Cancel</Button><Button tone="primary" onClick={() => {
      if (!name.trim()) return;
      ops.saveCustomer({ id: existing?.id || crypto.randomUUID(), name: name.trim(), abn: existing?.abn || "", site, address: existing?.address || site, terms: existing?.terms || 30, contacts: [{ name: contact, role: existing?.contacts[0]?.role || "", email: existing?.contacts[0]?.email || "", phone }] });
      ops.toast("Customer saved");
      ops.closeModal();
    }}>Save</Button></div>}>
      <div className="grid gap-2.5">
        <Field label="Customer *"><TextInput value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Site / address"><TextInput value={site} onChange={(event) => setSite(event.target.value)} /></Field>
        <Field label="Main contact"><TextInput value={contact} onChange={(event) => setContact(event.target.value)} /></Field>
        <Field label="Phone"><TextInput value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
      </div>
      {existing ? <p className="m-0 text-[12.5px] text-muted">{ops.data?.deals.filter((deal) => deal.customerId === existing.id).length || 0} deals on file.</p> : null}
    </Modal>
  );
}

function SupplierModal({ id }: { id?: string }) {
  const ops = useOps();
  const supplier = ops.data?.suppliers.find((item) => item.id === id);
  if (!supplier) return <Modal title="Supplier" onClose={ops.closeModal}><p className="m-0 text-muted">Open a supplier from the purchasing list.</p></Modal>;
  const items = Object.entries(supplier.items);
  return (
    <Modal wide title={supplier.name} eyebrow={`${supplier.phone} · ${supplier.email}`} onClose={ops.closeModal} footer={<div className="flex justify-end"><Button onClick={ops.closeModal}>Close</Button></div>}>
      <p className="m-0 text-[12.5px] text-muted">Lead time {supplier.lead} days. {items.length} linked item{items.length === 1 ? "" : "s"}.</p>
      <DataTable>
        <thead><tr><Th>Item</Th><Th>Their part no.</Th><Th numeric>Price</Th><Th numeric>Min order</Th><Th numeric>Lead days</Th></tr></thead>
        <tbody>
          {items.map(([itemId, item]) => (
            <tr key={itemId}>
              <Td className="font-mono">{ops.partMap.get(itemId)?.partNo || itemId}</Td>
              <Td className="font-mono">{item.supCode}</Td>
              <Td numeric>{money(item.price)}</Td>
              <Td numeric>{item.moq}</Td>
              <Td numeric>{item.lead}</Td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Modal>
  );
}

function PoModal({ id }: { id: string }) {
  const ops = useOps();
  const po = ops.data?.pos.find((item) => item.id === id);
  if (!po) return null;
  const total = po.lines.reduce((sum, line) => sum + line.qty * line.price, 0);
  return (
    <Modal wide title={po.no} eyebrow={ops.supplierName(po.supplierId)} onClose={ops.closeModal} footer={<div className="flex justify-end"><Button onClick={ops.closeModal}>Close</Button></div>}>
      <p className="m-0 text-[12.5px] text-muted">{PO_LABEL[po.status]} · ordered {fmtDate(po.date)} · expected {fmtDate(po.expected)} · {money(total)} ex GST</p>
      <DataTable>
        <thead><tr><Th>Item</Th><Th>Supplier code</Th><Th numeric>Qty</Th><Th numeric>Received</Th><Th numeric>Price</Th></tr></thead>
        <tbody>
          {po.lines.map((line) => (
            <tr key={line.itemId}>
              <Td className="font-mono">{ops.partMap.get(line.itemId)?.partNo}</Td>
              <Td className="font-mono">{line.supCode}</Td>
              <Td numeric>{qfmt(line.qty)}</Td>
              <Td numeric>{qfmt(line.received)}</Td>
              <Td numeric>{money(line.price)}</Td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Modal>
  );
}

function ProductModal({ id }: { id?: string }) {
  const ops = useOps();
  const existing = id ? ops.productMap.get(id) : undefined;
  const [name, setName] = useState(existing?.name || "");
  const [category, setCategory] = useState(existing?.category || "Primary Belt Cleaners");
  const [notes, setNotes] = useState(existing?.notes || "");
  return (
    <Modal title={existing ? "Edit product type" : "New product type"} onClose={ops.closeModal} footer={<div className="flex justify-end gap-2"><Button onClick={ops.closeModal}>Cancel</Button><Button tone="primary" onClick={() => {
      if (!name.trim()) return;
      if (existing) ops.patchProduct(existing.id, { name: name.trim(), category, notes });
      else {
        const productId = crypto.randomUUID();
        ops.addProduct({ id: productId, name: name.trim(), category, sourcePage: "", variantIds: [], spareIds: [], attrCols: [], roles: ["Tensioner", "Pole", "Arm", "Cushion", "Tip / Blade", "Frame", "Accessories"], moduleWidth: 0, notes, custom: true, copiedFrom: "" });
        ops.selectProduct(productId);
      }
      ops.toast("Product type saved");
      ops.closeModal();
    }}>Save</Button></div>}>
      <div className="grid gap-2.5">
        <Field label="Name *"><TextInput value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Category"><TextInput value={category} onChange={(event) => setCategory(event.target.value)} /></Field>
        <Field label="Notes"><TextInput value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function CellModal({ productId, variantId, role }: { productId: string; variantId: string; role: string }) {
  const ops = useOps();
  const product = ops.productMap.get(productId);
  const variant = ops.partMap.get(variantId);
  const pool = (product?.spareIds || []).map((spareId) => ops.partMap.get(spareId)).filter((part) => !!part);
  const preferred = pool.filter((part) => (part.role || "Accessories") === role);
  const choices = preferred.length ? preferred : pool;
  const current = variant?.components.find((line) => (line.role || "Accessories") === role);
  const [partId, setPartId] = useState(current?.partId || "");
  const [qty, setQty] = useState(String(current?.qty || 1));
  if (!variant) return null;
  return (
    <Modal title={role} eyebrow={`${variant.partNo} · ${variant.description}`} onClose={ops.closeModal} footer={<div className="flex justify-end gap-2"><Button onClick={ops.closeModal}>Cancel</Button><Button tone="primary" onClick={() => {
      const rest = variant.components.filter((line) => (line.role || "Accessories") !== role);
      const nextQty = Number(qty) || 0;
      ops.patchPart(variant.id, { components: partId && nextQty > 0 ? [...rest, { partId, qty: nextQty, role }] : rest });
      ops.toast("Matrix cell saved");
      ops.closeModal();
    }}>Save</Button></div>}>
      <p className="m-0 text-[12.5px] text-muted">Choose the part for this role. Width and material-specific parts stay on this variant until you copy the BOM.</p>
      <Field label="Part">
        <SelectInput value={partId} onChange={(event) => setPartId(event.target.value)}>
          <option value="">None</option>
          {choices.slice(0, 80).map((part) => <option key={part.id} value={part.id}>{part.partNo} · {part.description}</option>)}
        </SelectInput>
      </Field>
      <Field label="Quantity"><TextInput type="number" min={0} max={100} value={qty} onChange={(event) => setQty(event.target.value)} /></Field>
    </Modal>
  );
}

function StockMoveModal({ id, move }: { id: string; move: "receive" | "issue" | "adjust" }) {
  const ops = useOps();
  const part = ops.partMap.get(id);
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const labels = { receive: "Receive stock", issue: "Issue / sell", adjust: "Stock count" };
  return (
    <Modal title={labels[move]} eyebrow={part ? `${part.partNo} · ${part.description}` : id} onClose={ops.closeModal} footer={<div className="flex justify-end gap-2"><Button onClick={ops.closeModal}>Cancel</Button><Button tone="primary" onClick={() => {
      const amount = Number(qty);
      if (!Number.isFinite(amount)) return;
      const signed = move === "issue" ? -Math.abs(amount) : move === "receive" ? Math.abs(amount) : amount;
      ops.moveStock(id, signed, move, note.trim() || labels[move]);
      ops.toast("Stock updated");
      ops.closeModal();
    }}>Save</Button></div>}>
      <Field label={move === "adjust" ? "Counted quantity" : "Quantity"}><TextInput type="number" min={0} value={qty} onChange={(event) => setQty(event.target.value)} /></Field>
      <Field label="Note"><TextInput value={note} onChange={(event) => setNote(event.target.value)} /></Field>
    </Modal>
  );
}
