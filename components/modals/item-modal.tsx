"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { LEVELS } from "@/lib/domain/types";
import { useOps } from "@/components/providers/ops-provider";

export function ItemModal({ id }: { id?: string }) {
  const ops = useOps();
  const existing = id ? ops.partMap.get(id) : undefined;
  const [partNo, setPartNo] = useState(existing?.partNo || "");
  const [orderNo, setOrderNo] = useState(existing?.orderNo || "");
  const [description, setDescription] = useState(existing?.description || "");
  const [level, setLevel] = useState(existing?.level || "Item");
  const [material, setMaterial] = useState(existing?.material || "");
  const [width, setWidth] = useState(existing?.width?.toString() || "");
  const [role, setRole] = useState(existing?.role || "");
  const [supplier, setSupplier] = useState(existing?.supplier || "");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [error, setError] = useState("");

  return (
    <Modal
      title={existing ? `Edit ${existing.partNo}` : "New item"}
      eyebrow={existing ? existing.description : "Add an item to the register"}
      onClose={ops.closeModal}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={ops.closeModal}>Cancel</Button>
          <Button tone="primary" onClick={save}>{existing ? "Save" : "Add item"}</Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2.5 max-[520px]:grid-cols-1">
        <Field label="Item code *"><TextInput className="font-mono" value={partNo} onChange={(event) => setPartNo(event.target.value)} /></Field>
        <Field label="Ordering no."><TextInput className="font-mono" value={orderNo} onChange={(event) => setOrderNo(event.target.value)} /></Field>
        <Field label="Description *" className="col-span-full"><TextInput value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
        <Field label="Level">
          <SelectInput value={level} onChange={(event) => setLevel(event.target.value)}>
            <option value="">Not set</option>
            {LEVELS.map((entry) => <option key={entry}>{entry}</option>)}
          </SelectInput>
        </Field>
        <Field label="Role"><TextInput value={role} onChange={(event) => setRole(event.target.value)} placeholder="Tensioner, Pole, Arm…" /></Field>
        <Field label="Belt width (mm)"><TextInput type="number" value={width} onChange={(event) => setWidth(event.target.value)} /></Field>
        <Field label="Material / version"><TextInput value={material} onChange={(event) => setMaterial(event.target.value)} /></Field>
        <Field label="Supplier" className="col-span-full"><TextInput value={supplier} onChange={(event) => setSupplier(event.target.value)} /></Field>
        <Field label="Notes" className="col-span-full"><TextArea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      </div>
      {error ? <div className="rounded-app bg-bad-soft px-2.5 py-2 text-[13px] text-bad">{error}</div> : null}
    </Modal>
  );

  function save() {
    const code = partNo.trim();
    if (!code || !description.trim()) { setError("Item code and description are required."); return; }
    const taken = ops.findByNo(code);
    if (taken && taken !== id) { setError(`Item code ${code} is already used.`); return; }
    const patch = {
      partNo: code,
      orderNo: orderNo.trim(),
      description: description.trim(),
      level,
      material: material.trim(),
      width: width === "" ? null : Number(width),
      role: role.trim(),
      supplier: supplier.trim(),
      notes: notes.trim(),
      tempCode: /^TMP-/i.test(code),
    };
    if (existing) {
      ops.patchPart(existing.id, patch);
      ops.toast("Item saved");
    } else {
      const newId = /^[A-Za-z0-9_.-]{1,60}$/.test(code) ? code : crypto.randomUUID();
      ops.addPart({
        id: newId,
        category: "",
        sourcePage: "",
        kind: "",
        attrs: {},
        weight: "",
        makeBuy: "",
        productIds: [],
        components: [],
        labour: 0,
        catalog: false,
        ...patch,
      });
      ops.selectItem(newId);
      ops.toast(`Item ${code} added`);
    }
    ops.closeModal();
  }
}
