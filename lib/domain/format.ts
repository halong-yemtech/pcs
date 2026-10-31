export function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function money(v: number): string {
  return (
    "$" +
    num(v).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function qfmt(v: number): string {
  const n = num(v);
  return Number.isInteger(n)
    ? n.toLocaleString("en-AU")
    : n.toLocaleString("en-AU", { maximumFractionDigits: 3 });
}

export function kg(v: number): string {
  return num(v).toLocaleString("en-AU", { maximumFractionDigits: 2 }) + " kg";
}

export function ymd(offset = 0, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const base = iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  if (Number.isNaN(base.getTime())) return iso;
  return ymd(days, base);
}

export function todayISO(): string {
  return ymd(0);
}

export function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

export function when(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function monthLabel(ym: string): string {
  const d = new Date(ym + "-01T00:00:00");
  if (Number.isNaN(d.getTime())) return ym;
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

export function fileSize(bytes: number): string {
  if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  return Math.max(1, Math.round(bytes / 1024)) + " KB";
}

export function shortMat(m?: string): string {
  return String(m || "").replace("Mild Steel", "MS").replace("Stainless Steel", "SS");
}

export function baseDesc(description?: string): string {
  return String(description || "").split(" · ")[0];
}

export function nextNo(existing: string[], prefix: string): string {
  let max = 0;
  for (const value of existing) {
    if (!value.startsWith(prefix)) continue;
    const n = parseInt(value.slice(prefix.length), 10);
    if (n > max) max = n;
  }
  return prefix + String(max + 1).padStart(4, "0");
}

export function daysBetween(from: string, to: string): number {
  const a = new Date((from || "").slice(0, 10) + "T00:00:00").getTime();
  const b = new Date((to || "").slice(0, 10) + "T00:00:00").getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export function fyOf(iso?: string): number | null {
  if (!iso) return null;
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m) return null;
  return m >= 7 ? y + 1 : y;
}

export function revLabel(index: number): string {
  let s = "";
  let n = index + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
