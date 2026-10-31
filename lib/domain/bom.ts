import type { Part, Price, Product, StockRec } from "./types";

export type Line = { i: number; partId: string; qty: number; role: string; perModule: number };

export function lines(part?: Part | null): Line[] {
  if (!part) return [];
  return part.components
    .map((line, i) => ({
      i,
      partId: line.partId,
      qty: Number(line.qty) || 0,
      role: line.role || "",
      perModule: Number(line.perModule) || 0,
    }))
    .filter((line) => line.partId && line.qty > 0);
}

export function isAsm(part?: Part | null): boolean {
  return lines(part).some((line) => line.qty > 0);
}

export function buyOf(id: string, prices: Record<string, Price>): number {
  const buy = prices[id]?.buy;
  return buy == null ? 0 : Number(buy) || 0;
}

export function sellOf(id: string, prices: Record<string, Price>): number {
  return Number(prices[id]?.sell) || 0;
}

export function onHand(id: string, stock: Record<string, StockRec>): number {
  return Number(stock[id]?.onHand) || 0;
}

export function stockStatus(id: string, stock: Record<string, StockRec>): "" | "out" | "low" | "ok" {
  const row = stock[id];
  if (!row || (row.onHand == null && !row.min)) return "";
  const qty = Number(row.onHand) || 0;
  const min = Number(row.min) || 0;
  if (qty <= 0) return "out";
  if (min && qty < min) return "low";
  return "ok";
}

export function unitCost(
  id: string,
  parts: Map<string, Part>,
  prices: Record<string, Price>,
  memo = new Map<string, number>(),
  stack = new Set<string>(),
): number {
  if (memo.has(id)) return memo.get(id)!;
  const part = parts.get(id);
  if (!part) return 0;
  const buy = buyOf(id, prices);
  if (buy > 0 || !isAsm(part)) {
    memo.set(id, buy);
    return buy;
  }
  if (stack.has(id)) return 0;
  stack.add(id);
  let total = part.labour || 0;
  for (const line of lines(part)) total += line.qty * unitCost(line.partId, parts, prices, memo, stack);
  stack.delete(id);
  memo.set(id, total);
  return total;
}

export function bomCost(
  id: string,
  parts: Map<string, Part>,
  prices: Record<string, Price>,
  stack = new Set<string>(),
): number {
  const part = parts.get(id);
  if (!part || !isAsm(part)) return 0;
  let total = part.labour || 0;
  stack.add(id);
  for (const line of lines(part)) {
    if (!stack.has(line.partId)) total += line.qty * unitCost(line.partId, parts, prices);
  }
  stack.delete(id);
  return total;
}

export function marginPct(id: string, parts: Map<string, Part>, prices: Record<string, Price>): number | null {
  const sell = sellOf(id, prices);
  if (!sell) return null;
  const cost = unitCost(id, parts, prices);
  return ((sell - cost) / sell) * 100;
}

export type Exploded = {
  level: number;
  id: string;
  part?: Part;
  qty: number;
  role: string;
  total: number;
  key: string;
  index: number;
  hasKids: boolean;
  cycle: boolean;
};

const LEVELS = ["Product", "Part", "Component", "Item"];

export function explode(
  id: string,
  parts: Map<string, Part>,
  collapsed: Set<string> = new Set(),
  mult = 1,
  level = 0,
  path = "",
  out: Exploded[] = [],
  stack = new Set<string>([id]),
): Exploded[] {
  for (const line of lines(parts.get(id))) {
    const child = parts.get(line.partId);
    const key = path + "/" + line.i;
    const total = mult * line.qty;
    const cycle = stack.has(line.partId);
    const hasKids = !cycle && isAsm(child);
    out.push({ level: level + 1, id: line.partId, part: child, qty: line.qty, role: line.role, total, key, index: line.i, hasKids, cycle });
    if (hasKids && !collapsed.has(key)) {
      stack.add(line.partId);
      explode(line.partId, parts, collapsed, total, level + 1, key, out, stack);
      stack.delete(line.partId);
    }
  }
  return out;
}

export function leafList(id: string, parts: Map<string, Part>, mult = 1, acc = new Map<string, number>(), stack = new Set<string>([id])) {
  for (const line of lines(parts.get(id))) {
    const child = parts.get(line.partId);
    const total = mult * line.qty;
    if (child && isAsm(child) && !stack.has(line.partId)) {
      stack.add(line.partId);
      leafList(line.partId, parts, total, acc, stack);
      stack.delete(line.partId);
    } else acc.set(line.partId, (acc.get(line.partId) || 0) + total);
  }
  return [...acc.entries()]
    .map(([pid, qty]) => ({ pid, qty, part: parts.get(pid) }))
    .sort((a, b) => String(a.part?.partNo).localeCompare(String(b.part?.partNo), undefined, { numeric: true }));
}

export function canBuild(id: string, parts: Map<string, Part>, stock: Record<string, StockRec>): number | null {
  const partLines = lines(parts.get(id));
  if (!partLines.length) return null;
  return Math.max(0, Math.min(...partLines.map((line) => Math.floor(onHand(line.partId, stock) / line.qty))));
}

export function levelRank(level?: string): number {
  const index = LEVELS.indexOf(level || "");
  return index < 0 ? -1 : index;
}

const ARMS = ["SS", "S", "M", "L", "LL"];

export function compareVariants(a: Part, b: Part): number {
  const arm = (part: Part) => {
    const index = ARMS.indexOf(part.attrs["Arm Size"] || "");
    return index < 0 ? 9 : index;
  };
  return (
    (a.width || 0) - (b.width || 0) ||
    String(a.material).localeCompare(String(b.material)) ||
    arm(a) - arm(b) ||
    a.partNo.localeCompare(b.partNo, undefined, { numeric: true })
  );
}

export function compareCodes(a: Part, b: Part): number {
  return a.partNo.localeCompare(b.partNo, undefined, { numeric: true });
}

export function filled(product: Product, parts: Map<string, Part>): { n: number; done: number } {
  const variants = product.variantIds.map((id) => parts.get(id)).filter((part): part is Part => !!part);
  return { n: variants.length, done: variants.filter((part) => isAsm(part)).length };
}

export function onOrderQty(itemId: string, orders: { status: string; lines: { itemId: string; qty: number; received: number }[] }[]): number {
  let total = 0;
  for (const order of orders) {
    if (!["sent", "part", "draft"].includes(order.status)) continue;
    for (const line of order.lines) {
      const remaining = Math.max(0, line.qty - line.received);
      if (remaining > 0 && line.itemId === itemId) total += remaining;
    }
  }
  return total;
}
