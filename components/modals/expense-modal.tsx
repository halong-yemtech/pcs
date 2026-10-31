"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { nextNo, todayISO } from "@/lib/domain/format";
import { EXP_ACCT, EXP_CATS, PAID_BY } from "@/lib/domain/types";
import { useOps } from "@/components/providers/ops-provider";

export function ExpenseModal({ id, saleId }: { id?: string; saleId?: string }) {
  const ops = useOps();
  const existing = ops.data?.expenses.find((expense) => expense.id === id);
  const [date, setDate] = useState(existing?.date || todayISO());
  const [payee, setPayee] = useState(existing?.payee || "");
  const [description, setDescription] = useState(existing?.description || "");
  const [category, setCategory] = useState(existing?.category || "General");
  const [total, setTotal] = useState(existing?.total?.toString() || "");
  const [gstFree, setGstFree] = useState(existing?.gstFree || false);
  const [paidBy, setPaidBy] = useState(existing?.paidBy || "Business bank account");
  const [ref, setRef] = useState(existing?.ref || "");
  const [sale, setSale] = useState(existing?.saleId || saleId || "");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [error, setError] = useState("");
  return (
    <Modal
      title={existing ? `Expense ${existing.no}` : "New expense"}
      onClose={ops.closeModal}
      footer={<div className="flex justify-end gap-2"><Button onClick={ops.closeModal}>Cancel</Button><Button tone="primary" onClick={save}>{existing ? "Save" : "Add expense"}</Button></div>}
    >
      <div className="grid grid-cols-2 gap-2.5 max-[520px]:grid-cols-1">
        <Field label="Date *"><TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Payee *"><TextInput value={payee} placeholder="e.g. Ampol, Bunnings, Toll" onChange={(event) => setPayee(event.target.value)} /></Field>
        <Field label="What was it for? *" className="col-span-full"><TextInput value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
        <Field label="Category">
          <SelectInput value={category} onChange={(event) => setCategory(event.target.value)}>{EXP_CATS.map(([name]) => <option key={name}>{name}</option>)}</SelectInput>
        </Field>
        <Field label="Total paid inc GST ($) *"><TextInput type="number" min={0} step="0.01" value={total} onChange={(event) => setTotal(event.target.value)} /></Field>
        <label className="col-span-full flex items-center gap-1.5 text-[12.5px] text-muted"><input type="checkbox" checked={gstFree} onChange={(event) => setGstFree(event.target.checked)} /> No GST on this purchase</label>
        <Field label="Paid by">
          <SelectInput value={paidBy} onChange={(event) => setPaidBy(event.target.value)}>{PAID_BY.map((option) => <option key={option}>{option}</option>)}</SelectInput>
        </Field>
        <Field label="Receipt / invoice no."><TextInput className="font-mono" value={ref} onChange={(event) => setRef(event.target.value)} /></Field>
        <Field label="Charge to sale (optional)" className="col-span-full">
          <SelectInput value={sale} onChange={(event) => setSale(event.target.value)}>
            <option value="">Not charged to a sale</option>
            {ops.data?.deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.no} · {ops.customerName(deal.customerId)} · {deal.title}</option>)}
          </SelectInput>
        </Field>
        <Field label="Notes" className="col-span-full"><TextArea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      </div>
      {error ? <div className="rounded-app bg-bad-soft px-2.5 py-2 text-[13px] text-bad">{error}</div> : null}
    </Modal>
  );

  function save() {
    const amount = Number(total);
    if (!date || !payee.trim() || !description.trim()) { setError("Date, payee and what it was for are required."); return; }
    if (!(amount > 0) || !ops.data) { setError("Enter the total paid."); return; }
    const gst = gstFree ? 0 : Number((amount / 11).toFixed(2));
    const no = existing?.no || nextNo(ops.data.expenses.map((expense) => expense.no), "EXP-");
    ops.saveExpense({
      id: existing?.id || crypto.randomUUID(),
      no,
      date,
      payee: payee.trim(),
      description: description.trim(),
      category,
      account: EXP_ACCT[category] || "429",
      total: amount,
      gst,
      gstFree,
      paidBy,
      ref: ref.trim(),
      saleId: sale || null,
      reimbursed: existing?.reimbursed || false,
      notes: notes.trim(),
      receiptName: existing?.receiptName,
      xeroAt: existing?.xeroAt,
    });
    ops.toast(existing ? "Expense saved" : `Expense ${no} added`);
    ops.closeModal();
  }
}
