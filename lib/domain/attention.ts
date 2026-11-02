import { APPROVAL_QUOTE, type AlertSettings, type AlertState, type AttentionItem, type Me, type StaffUser, type Workspace } from "./types";
import { daysBetween, num, todayISO } from "./format";
import { dealValue, quoteTotals, suppliedQty } from "./sales";

export const RULE_DEFS: { id: string; label: string; days: number; unit: string }[] = [
  { id: "lead_idle", label: "Lead with no quote yet", days: 3, unit: "days in Lead" },
  { id: "quote_followup", label: "Quote awaiting customer response", days: 7, unit: "days after it was sent" },
  { id: "po_not_started", label: "Customer PO received, production not started", days: 2, unit: "days after the PO date" },
  { id: "next_action", label: "Next action date passed", days: 0, unit: "days after the date" },
  { id: "payment_overdue", label: "Invoice payment overdue", days: 0, unit: "days after due" },
  { id: "build_overdue", label: "Build order past its due date", days: 0, unit: "days after due" },
  { id: "po_late", label: "Supplier delivery late", days: 0, unit: "days after expected date" },
  { id: "rfq_no_reply", label: "RFQ: supplier quote not received", days: 0, unit: "days after reply-by date" },
  { id: "stock_low", label: "Stock below its minimum (counting stock on order)", days: 0, unit: "uses each item’s minimum on the Stock tab" },
  { id: "sale_short", label: "Not enough stock for an open sale", days: 0, unit: "sales at PO received, production or ready" },
];

export function defaultAlertSettings(): AlertSettings {
  return { rules: Object.fromEntries(RULE_DEFS.map((rule) => [rule.id, { on: true, days: rule.days }])) };
}

const TASK_ACT: Record<string, string> = {
  approval: "Review & approve",
  lead_idle: "Prepare the quote",
  quote_followup: "Follow up the customer",
  po_not_started: "Start production",
  build_overdue: "Check the build",
  payment_overdue: "Chase payment",
  rfq_no_reply: "Chase the supplier",
  po_late: "Chase the delivery",
  next_action: "Do the next action",
  stock_low: "Order more",
  sale_short: "Order for the sale",
};

export function taskAction(item: AttentionItem, nextAction?: string, approver = true): string {
  if (item.severity === "approval") return approver ? "Review & approve" : "Waiting on a Director";
  if (item.rule === "next_action") return nextAction || TASK_ACT.next_action;
  return TASK_ACT[item.rule] || "Open";
}

export type AttentionInput = Pick<Workspace, "deals" | "orders" | "pos" | "rfqs" | "customers"> & {
  stock?: Workspace["stock"];
  parts?: { id: string; partNo: string; description: string }[];
  settings?: AlertSettings;
};

export function isApprover(email: string, role: string, users: StaffUser[]): boolean {
  const directors = users.filter((user) => user.title === "Director").map((user) => user.email.toLowerCase());
  if (directors.length) return directors.includes(email.toLowerCase());
  return role === "admin";
}

export function itemFor(item: AttentionItem, me: Pick<Me, "email" | "role"> | null, users: StaffUser[]): boolean {
  if (!me) return true;
  const email = me.email.toLowerCase();
  if (item.severity === "approval") return isApprover(email, me.role, users) || item.owner.toLowerCase() === email || item.requester === email;
  if (item.owner && item.owner.toLowerCase() === email) return true;
  const managers = users.filter((user) => user.title === "Manager" || user.role === "admin");
  const manager = managers.some((user) => user.email.toLowerCase() === email) || (me.role === "admin" && managers.length === 0);
  return manager && (item.escalate || !item.owner);
}

export function attentionPayload(data: Pick<Workspace, "deals" | "orders" | "pos" | "rfqs" | "customers" | "stock"> & { parts: { id: string; partNo: string; description: string }[]; settings?: AlertSettings }): AttentionInput {
  const ids = new Set(Object.keys(data.stock));
  for (const deal of data.deals) for (const line of deal.quote?.lines || []) if (line.itemId) ids.add(line.itemId);
  const byId = new Map(data.parts.map((part) => [part.id, part]));
  return {
    deals: data.deals,
    orders: data.orders,
    pos: data.pos,
    rfqs: data.rfqs,
    customers: data.customers,
    stock: data.stock,
    settings: data.settings,
    parts: [...ids].map((id) => ({ id, partNo: byId.get(id)?.partNo || id, description: byId.get(id)?.description || "" })),
  };
}

export function activeItems(items: AttentionItem[], states: AlertState[], today = todayISO()): AttentionItem[] {
  const byKey = new Map(states.map((state) => [state.key, state]));
  return items.filter((item) => {
    const state = byKey.get(item.key);
    if (!state) return true;
    if (state.dismissed) return false;
    return !(state.snoozedUntil && state.snoozedUntil > today);
  });
}

const ESCALATE_DAYS = 3;

function item(
  partial: Omit<AttentionItem, "escalate" | "age"> & { age: number },
): AttentionItem {
  return { ...partial, escalate: partial.age >= ESCALATE_DAYS && partial.severity !== "approval" };
}

export function evaluateAttention(workspace: AttentionInput, today = todayISO()): AttentionItem[] {
  const settings = workspace.settings || defaultAlertSettings();
  const on = (id: string) => settings.rules[id]?.on !== false;
  const lim = (id: string) => num(settings.rules[id]?.days ?? RULE_DEFS.find((rule) => rule.id === id)?.days);
  const customers = new Map(workspace.customers.map((customer) => [customer.id, customer.name]));
  const items: AttentionItem[] = [];

  for (const deal of workspace.deals) {
    const who = customers.get(deal.customerId) || "No customer";
    const title = `${deal.no} · ${who}`;
    if (on("lead_idle") && deal.stage === "lead") {
      const age = daysBetween(deal.createdAt.slice(0, 10), today);
      if (age >= lim("lead_idle")) {
        items.push(item({
          key: `lead_idle:${deal.id}`,
          rule: "lead_idle",
          severity: "due",
          label: "Lead with no quote yet",
          title,
          detail: deal.title || "No description",
          owner: deal.owner,
          age,
          coll: "deals",
          id: deal.id,
        }));
      }
    }
    if (on("quote_followup") && deal.stage === "quote" && deal.quote?.sentAt) {
      const age = daysBetween(deal.quote.sentAt, today);
      if (age >= lim("quote_followup")) {
        items.push(item({
          key: `quote_followup:${deal.id}`,
          rule: "quote_followup",
          severity: "due",
          label: "Quote awaiting customer response",
          title,
          detail: deal.quote.no,
          owner: deal.owner,
          age,
          coll: "deals",
          id: deal.id,
        }));
      }
    }
    if (deal.quote && ["lead", "quote"].includes(deal.stage) && !deal.quote.approved) {
      const value = quoteTotals(deal.quote).sub || dealValue(deal);
      if (value > APPROVAL_QUOTE) {
        items.push(item({
          key: `approval:${deal.id}`,
          rule: "quote_approval",
          severity: "approval",
          label: "Quote needs Director approval",
          title,
          detail: `Quote ${deal.quote.no} is over $20,000 ex GST`,
          owner: deal.owner,
          age: 0,
          coll: "deals",
          id: deal.id,
        }));
      }
    }
    if (on("po_not_started") && deal.stage === "po" && deal.po?.date) {
      const age = daysBetween(deal.po.date, today);
      if (age >= lim("po_not_started")) {
        items.push(item({
          key: `po_not_started:${deal.id}`,
          rule: "po_not_started",
          severity: "overdue",
          label: "Customer PO received, production not started",
          title,
          detail: deal.po.no,
          owner: deal.owner,
          age,
          coll: "deals",
          id: deal.id,
        }));
      }
    }
    if (on("next_action") && deal.nextDate && deal.nextDate < today && !["closed", "lost"].includes(deal.stage)) {
      const age = daysBetween(deal.nextDate, today);
      if (age >= lim("next_action")) items.push(item({
        key: `next_action:${deal.id}`,
        rule: "next_action",
        severity: "overdue",
        label: "Next action date passed",
        title,
        detail: deal.nextAction || "No action written",
        owner: deal.owner,
        age,
        coll: "deals",
        id: deal.id,
      }));
    }
    if (on("payment_overdue")) for (const invoice of deal.invoices) {
      if (!invoice.paid && invoice.due && invoice.due < today) {
        items.push(item({
          key: `payment_overdue:${deal.id}:${invoice.no}`,
          rule: "payment_overdue",
          severity: "overdue",
          label: "Invoice payment overdue",
          title,
          detail: invoice.no,
          owner: deal.owner,
          age: daysBetween(invoice.due, today),
          coll: "deals",
          id: deal.id,
        }));
      }
    }
  }

  if (on("build_overdue")) for (const order of workspace.orders) {
    if (order.status === "open" && order.due && order.due < today) {
      items.push(item({
        key: `build_overdue:${order.id}`,
        rule: "build_overdue",
        severity: "overdue",
        label: "Build order past its due date",
        title: order.no,
        detail: order.customer || order.ref,
        owner: "",
        age: daysBetween(order.due, today),
        coll: "orders",
        id: order.id,
      }));
    }
  }

  if (on("po_late")) for (const po of workspace.pos) {
    if (["sent", "part"].includes(po.status) && po.expected && po.expected < today) {
      items.push(item({
        key: `po_late:${po.id}`,
        rule: "po_late",
        severity: "overdue",
        label: "Supplier delivery late",
        title: po.no,
        detail: po.ref || "Expected date passed",
        owner: "",
        age: daysBetween(po.expected, today),
        coll: "pos",
        id: po.id,
      }));
    }
  }

  if (on("rfq_no_reply")) for (const rfq of workspace.rfqs) {
    if (rfq.status === "sent" && rfq.replyBy && rfq.replyBy < today) {
      items.push(item({
        key: `rfq_no_reply:${rfq.id}`,
        rule: "rfq_no_reply",
        severity: "due",
        label: "RFQ: supplier quote not received",
        title: rfq.no,
        detail: "Reply-by date passed",
        owner: "",
        age: daysBetween(rfq.replyBy, today),
        coll: "rfqs",
        id: rfq.id,
      }));
    }
  }

  const stock = workspace.stock || {};
  const parts = new Map((workspace.parts || []).map((part) => [part.id, part]));
  const onOrder = new Map<string, number>();
  for (const po of workspace.pos) {
    if (!["draft", "sent", "part"].includes(po.status)) continue;
    for (const line of po.lines) {
      const remaining = Math.max(0, num(line.qty) - num(line.received));
      if (remaining > 0 && line.itemId) onOrder.set(line.itemId, (onOrder.get(line.itemId) || 0) + remaining);
    }
  }
  if (on("sale_short")) {
    const need = new Map<string, { deal: (typeof workspace.deals)[number]; qty: number }[]>();
    for (const deal of workspace.deals) {
      if (!["po", "production", "ready"].includes(deal.stage)) continue;
      (deal.quote?.lines || []).forEach((line, index) => {
        if (!line.itemId) return;
        const built = workspace.orders.some((order) => order.dealId === deal.id && order.itemId === line.itemId);
        const qty = Math.max(0, num(line.qty) - suppliedQty(deal, index));
        if (qty > 0 && !built) {
          const list = need.get(line.itemId) || [];
          list.push({ deal, qty });
          need.set(line.itemId, list);
        }
      });
    }
    for (const [id, list] of need) {
      let available = num(stock[id]?.onHand) + (onOrder.get(id) || 0);
      const ordered = [...list].sort((a, b) => String(a.deal.po?.required || a.deal.no).localeCompare(String(b.deal.po?.required || b.deal.no)));
      for (const { deal, qty } of ordered) {
        const short = Math.max(0, qty - Math.max(0, available));
        available -= qty;
        if (short <= 0) continue;
        const part = parts.get(id);
        const who = customers.get(deal.customerId) || deal.no;
        items.push(item({
          key: `sale_short:${deal.id}:${id}:${short}`,
          rule: "sale_short",
          severity: "overdue",
          label: "Short for a sale",
          title: `${part?.partNo || id} · ${deal.no}`,
          detail: `Need ${qty} for ${who}${deal.po?.required ? ` by ${deal.po.required}` : ""}; ${num(stock[id]?.onHand)} on hand, ${onOrder.get(id) || 0} on order (short ${short})${part?.description ? ` · ${part.description}` : ""}`,
          owner: deal.owner,
          age: 0,
          coll: "items",
          id,
          saleId: deal.id,
        }));
      }
    }
  }
  if (on("stock_low")) {
    for (const [id, row] of Object.entries(stock)) {
      const minimum = num(row.min);
      if (!minimum) continue;
      const onHand = num(row.onHand);
      const ordered = onOrder.get(id) || 0;
      if (onHand >= minimum || onHand + ordered >= minimum) continue;
      const part = parts.get(id);
      items.push(item({
        key: `stock_low:${id}:${onHand <= 0 ? "out" : "low"}:${String(row.updatedAt || "").slice(0, 10)}`,
        rule: "stock_low",
        severity: onHand <= 0 ? "overdue" : "due",
        label: onHand <= 0 ? "Out of stock" : "Stock low",
        title: `${part?.partNo || id}${part?.description ? ` · ${part.description}` : ""}`,
        detail: `${onHand} on hand, minimum ${minimum}${ordered ? `, ${ordered} on order` : ""}${row.location ? ` · bin ${row.location}` : ""}`,
        owner: "",
        age: 0,
        coll: "items",
        id,
      }));
    }
  }

  const rank = { approval: 0, overdue: 1, due: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity] || b.age - a.age);
}
