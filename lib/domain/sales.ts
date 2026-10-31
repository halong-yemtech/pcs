import { GST, HIST_DAYS, type Deal, type Docket, type Invoice, type Quote } from "./types";
import { addDays, num, todayISO } from "./format";

export function quoteTotals(quote?: Quote) {
  const sub = (quote?.lines || []).reduce((sum, line) => sum + num(line.qty) * num(line.price) * (1 - num(line.disc) / 100), 0);
  const gst = sub * GST;
  return { sub, gst, total: sub + gst };
}

export function dealValue(deal: Deal): number {
  return deal.quote?.lines?.length ? quoteTotals(deal.quote).sub : num(deal.value);
}

export function docketsOf(deal: Deal): Docket[] {
  return deal.dockets || [];
}

export function invoicesOf(deal: Deal): Invoice[] {
  return deal.invoices || [];
}

export function suppliedQty(deal: Deal, index: number): number {
  return docketsOf(deal).reduce((sum, docket) => {
    const line = (docket.lines || []).find((entry) => entry.li === index);
    return sum + num(line?.supplied);
  }, 0);
}

export function hasBackOrder(deal: Deal): boolean {
  return (deal.quote?.lines || []).some((line, index) => num(line.qty) - suppliedQty(deal, index) > 1e-9);
}

export function uninvoiced(deal: Deal): Docket[] {
  const invoiced = new Set(invoicesOf(deal).map((invoice) => invoice.docketNo));
  return docketsOf(deal).filter((docket) => !invoiced.has(docket.docketNo));
}

export function unpaid(deal: Deal): number {
  return invoicesOf(deal).filter((invoice) => !invoice.paid).reduce((sum, invoice) => sum + num(invoice.amount), 0);
}

export function invoicedTotal(deal: Deal): number {
  return invoicesOf(deal).reduce((sum, invoice) => sum + num(invoice.amount), 0);
}

export function isHistoric(deal: Deal, today = todayISO()): boolean {
  if (deal.stage !== "closed" || !deal.closedAt) return false;
  return addDays(deal.closedAt.slice(0, 10), HIST_DAYS) <= today;
}

export function leadToPaidDays(deal: Deal): number | null {
  if (!deal.createdAt || !deal.closedAt) return null;
  const start = new Date(deal.createdAt).getTime();
  const end = new Date(deal.closedAt.slice(0, 10) + "T00:00:00").getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}

export { HIST_DAYS };
