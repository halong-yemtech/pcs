import { APPROVAL_QUOTE, type AttentionItem, type Workspace } from "./types";
import { daysBetween, todayISO } from "./format";
import { dealValue, quoteTotals } from "./sales";

const ESCALATE_DAYS = 3;

function item(
  partial: Omit<AttentionItem, "escalate" | "age"> & { age: number },
): AttentionItem {
  return { ...partial, escalate: partial.age >= ESCALATE_DAYS && partial.severity !== "approval" };
}

export function evaluateAttention(workspace: Pick<Workspace, "deals" | "orders" | "pos" | "rfqs" | "customers">, today = todayISO()): AttentionItem[] {
  const customers = new Map(workspace.customers.map((customer) => [customer.id, customer.name]));
  const items: AttentionItem[] = [];

  for (const deal of workspace.deals) {
    const who = customers.get(deal.customerId) || "No customer";
    const title = `${deal.no} · ${who}`;
    if (deal.stage === "lead") {
      const age = daysBetween(deal.createdAt.slice(0, 10), today);
      if (age >= 3) {
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
    if (deal.stage === "quote" && deal.quote?.sentAt) {
      const age = daysBetween(deal.quote.sentAt, today);
      if (age >= 7) {
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
    if (deal.stage === "po" && deal.po?.date) {
      const age = daysBetween(deal.po.date, today);
      if (age >= 2) {
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
    if (deal.nextDate && deal.nextDate < today && !["closed", "lost"].includes(deal.stage)) {
      items.push(item({
        key: `next_action:${deal.id}`,
        rule: "next_action",
        severity: "overdue",
        label: "Next action date passed",
        title,
        detail: deal.nextAction || "No action written",
        owner: deal.owner,
        age: daysBetween(deal.nextDate, today),
        coll: "deals",
        id: deal.id,
      }));
    }
    for (const invoice of deal.invoices) {
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

  for (const order of workspace.orders) {
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

  for (const po of workspace.pos) {
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

  for (const rfq of workspace.rfqs) {
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

  const rank = { approval: 0, overdue: 1, due: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity] || b.age - a.age);
}
