"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import type { Company } from "@/lib/domain/types";
import { useOps } from "@/components/providers/ops-provider";

const FIELDS: [keyof Company, string, "area"?][] = [
  ["name", "Trading name *"],
  ["legal", "Legal entity name"],
  ["abn", "ABN"],
  ["tagline", "Tagline"],
  ["address", "Address"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["web", "Website"],
  ["deliverTo", "Default PO delivery address"],
  ["contact", "Quote contact name"],
  ["contactRole", "Contact role"],
  ["contactPhone", "Contact mobile"],
  ["contactEmail", "Contact email"],
  ["xeroSales", "Xero sales account code"],
  ["xeroPurch", "Xero purchases account code"],
  ["xeroTaxSales", "Xero tax rate on sales"],
  ["xeroTaxPurch", "Xero tax rate on purchases"],
  ["bankAcctName", "Bank account name"],
  ["bankName", "Bank"],
  ["bankBsb", "BSB"],
  ["bankAcct", "Account number"],
  ["quoteTerms", "Default quote terms", "area"],
  ["poTerms", "Default note on purchase orders", "area"],
];

export function CompanyModal() {
  const ops = useOps();
  const [draft, setDraft] = useState<Company | null>(ops.data?.company || null);
  const [error, setError] = useState("");
  if (!draft) return null;
  return (
    <Modal
      wide
      title="Company details"
      onClose={ops.closeModal}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => { window.location.href = "/api/auth/logout"; }}>Sign out</Button>
          <span className="flex-1" />
          <Button onClick={ops.closeModal}>Close</Button>
          <Button tone="primary" onClick={() => {
            if (!draft.name.trim()) { setError("Trading name is required."); return; }
            ops.saveCompany(draft);
            ops.toast("Company details saved");
            ops.closeModal();
          }}>Save</Button>
        </div>
      }
    >
      <div className="flex items-center gap-3">
        <Image src="/logo.png" alt="" width={48} height={49} className="rounded-full bg-white" />
        <p className="m-0 text-[12.5px] text-muted">Used on quotes and purchase orders.</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 max-[520px]:grid-cols-1">
        {FIELDS.map(([key, label, area]) => (
          <Field key={key} label={label} className={area || key === "address" ? "col-span-full" : ""}>
            {area ? (
              <TextArea rows={3} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
            ) : (
              <TextInput value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
            )}
          </Field>
        ))}
      </div>
      {error ? <div className="rounded-app bg-bad-soft px-2.5 py-2 text-[13px] text-bad">{error}</div> : null}
    </Modal>
  );
}
