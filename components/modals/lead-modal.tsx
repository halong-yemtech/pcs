"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { nextNo, ymd } from "@/lib/domain/format";
import { useOps } from "@/components/providers/ops-provider";

export function LeadModal() {
  const ops = useOps();
  const [customer, setCustomer] = useState("");
  const [contact, setContact] = useState("");
  const [source, setSource] = useState("");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [nextDate, setNextDate] = useState(ymd(2));
  const [nextAction, setNextAction] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  return (
    <Modal
      title="New lead"
      onClose={ops.closeModal}
      footer={<div className="flex justify-end gap-2"><Button onClick={ops.closeModal}>Cancel</Button><Button tone="primary" onClick={save}>Add lead</Button></div>}
    >
      <div className="grid grid-cols-2 gap-2.5 max-[520px]:grid-cols-1">
        <Field label="Customer *" className="col-span-full"><TextInput list="lead-customers" value={customer} placeholder="Pick or type a new company" onChange={(event) => setCustomer(event.target.value)} /></Field>
        <datalist id="lead-customers">{ops.data?.customers.map((item) => <option key={item.id} value={item.name} />)}</datalist>
        <Field label="Contact"><TextInput value={contact} onChange={(event) => setContact(event.target.value)} /></Field>
        <Field label="Source"><TextInput value={source} placeholder="e.g. site visit, phone, tender" onChange={(event) => setSource(event.target.value)} /></Field>
        <Field label="What do they need? *" className="col-span-full"><TextInput value={title} placeholder="e.g. 2 × primary cleaners for CV-12, 1200 belt" onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="Estimated value ex GST ($)"><TextInput type="number" min={0} value={value} onChange={(event) => setValue(event.target.value)} /></Field>
        <Field label="Next action date"><TextInput type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} /></Field>
        <Field label="Next action" className="col-span-full"><TextInput value={nextAction} placeholder="e.g. Measure belt and send quote" onChange={(event) => setNextAction(event.target.value)} /></Field>
        <Field label="Notes" className="col-span-full"><TextArea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      </div>
      {error ? <div className="rounded-app bg-bad-soft px-2.5 py-2 text-[13px] text-bad">{error}</div> : null}
    </Modal>
  );

  function save() {
    if (!customer.trim() || !title.trim() || !ops.data) { setError("Customer and what they need are required."); return; }
    let customerId = ops.data.customers.find((item) => item.name.toLowerCase() === customer.trim().toLowerCase())?.id;
    if (!customerId) {
      customerId = crypto.randomUUID();
      ops.saveCustomer({ id: customerId, name: customer.trim(), abn: "", site: "", address: "", terms: 30, contacts: contact.trim() ? [{ name: contact.trim(), role: "", email: "", phone: "" }] : [] });
    }
    const id = crypto.randomUUID();
    const no = nextNo(ops.data.deals.map((deal) => deal.no), "SO-");
    ops.saveDeal({
      id,
      no,
      customerId,
      contact: contact.trim(),
      source: source.trim(),
      title: title.trim(),
      value: Number(value) || 0,
      stage: "lead",
      nextDate,
      nextAction: nextAction.trim(),
      notes: notes.trim(),
      owner: ops.me?.email || "",
      createdAt: new Date().toISOString(),
      dockets: [],
      invoices: [],
      history: [{ at: new Date().toISOString(), note: "Lead created", by: ops.me?.email || "" }],
    }, "Lead added");
    ops.setView("sales");
    ops.toast(`Lead ${no} added`);
    ops.openModal({ type: "deal", id });
  }
}
