import { DEF_ROLES, type Part, type Product } from "./types";

type RawItem = {
  partNo?: string;
  orderNo?: string;
  description?: string;
  category?: string;
  sourcePage?: string;
  kind?: string;
  material?: string;
  width?: number | string | null;
  attrs?: Record<string, string>;
  weight?: string | number;
  makeBuy?: string;
  productIds?: string[];
  role?: string;
  level?: string;
  components?: { partId?: string; qty?: number; role?: string; perModule?: number }[];
  labour?: number;
  supplier?: string;
  notes?: string;
  tempCode?: boolean;
};

type RawProduct = {
  name?: string;
  category?: string;
  sourcePage?: string;
  variantIds?: string[];
  spareIds?: string[];
  attrCols?: string[];
  roles?: string[];
  moduleWidth?: number | null;
  notes?: string;
  custom?: boolean;
  copiedFrom?: string;
};

type SeedChunk = {
  id?: string;
  data?: {
    items?: Record<string, RawItem>;
    products?: Record<string, RawProduct>;
  };
};

export type SeedFile = {
  collections?: { catalog?: SeedChunk[] };
};

const NO_MODULE_CATS = ["Ploughs"];
const NON_MODULAR = /^(U|A) Belt Cleaner\b|alledge/i;

export function defaultLevel(p: { kind: string; description: string; orderNo: string }): string {
  if (p.kind !== "spare" && p.kind !== "variant") return "";
  const text = (p.description + " " + (p.orderNo || "")).toLowerCase();
  if (p.kind === "variant") {
    const head = String(p.description).split(" · ")[0].toLowerCase();
    return /replacement|tensioner|\bpole\b|side assembl|spare/.test(head) ? "Part" : "Product";
  }
  if (/\bbolt|\bpin\b|\bnut\b|washer|screw|rivet|fastener|\bclip|toggle|split pin|grub/.test(text)) return "Item";
  if (/tensioner|\bpole|suspension arm|polyarm|side assembl|\bside\b|adjuster arm|blade|scraper|mandrel|segment|frame/.test(text)) {
    return "Part";
  }
  return "Component";
}

export function prodWidth(p: Pick<Part, "attrs">): number | null {
  const tip = Number(p.attrs["Tip Width (mm)"]);
  return Number.isFinite(tip) && tip > 0 ? tip : null;
}

export function modApplies(pr: Pick<Product, "category" | "name">): boolean {
  return !NO_MODULE_CATS.includes(pr.category) && !NON_MODULAR.test(pr.name || "");
}

export function defaultModule(pr: Product, parts: Map<string, Part>): number {
  const widths = pr.variantIds
    .map((id) => parts.get(id))
    .map((part) => (part ? prodWidth(part) : null))
    .filter((width): width is number => width != null);
  if (!widths.length || !modApplies(pr)) return 0;
  const fits = (mw: number) => widths.every((width) => width % mw === 0);
  if (pr.category === "Primary Belt Cleaners") {
    if (/alledge/i.test(pr.name)) return 0;
    return fits(200) ? 200 : fits(150) ? 150 : 0;
  }
  if (pr.category === "Secondary Belt Cleaners") return fits(150) ? 150 : 0;
  return 0;
}

export function modulesOf(pr: Product, part: Part): number | null {
  if (!modApplies(pr)) return null;
  const mw = pr.moduleWidth;
  const width = prodWidth(part);
  return mw && width ? width / mw : null;
}

export function modOk(modules: number | null): boolean {
  return modules != null && Math.abs(modules - Math.round(modules)) < 1e-6;
}

function toPart(id: string, raw: RawItem): Part {
  const partNo = String(raw.partNo || id);
  const kind = String(raw.kind || "");
  const description = String(raw.description || "");
  const orderNo = String(raw.orderNo || "");
  const width = raw.width == null || raw.width === "" ? null : Number(raw.width);
  const draft = { kind, description, orderNo };
  return {
    id,
    partNo,
    orderNo,
    description,
    category: String(raw.category || ""),
    sourcePage: String(raw.sourcePage || ""),
    kind,
    material: String(raw.material || ""),
    width: width != null && Number.isFinite(width) ? width : null,
    attrs: raw.attrs || {},
    weight: raw.weight == null ? "" : String(raw.weight),
    makeBuy: String(raw.makeBuy || ""),
    productIds: raw.productIds || [],
    role: String(raw.role || ""),
    level: raw.level || defaultLevel(draft),
    components: (raw.components || [])
      .filter((line) => line.partId)
      .map((line) => ({
        partId: String(line.partId),
        qty: Number(line.qty) || 0,
        role: line.role || "",
        perModule: Number(line.perModule) || 0,
      })),
    labour: Number(raw.labour) || 0,
    supplier: String(raw.supplier || ""),
    notes: String(raw.notes || ""),
    tempCode: Boolean(raw.tempCode) || /^TMP-/i.test(partNo),
    catalog: true,
  };
}

export function normalizeCatalog(seed: SeedFile): { parts: Part[]; products: Product[] } {
  const items: Record<string, RawItem> = {};
  const products: Record<string, RawProduct> = {};
  for (const chunk of seed.collections?.catalog || []) {
    Object.assign(items, chunk.data?.items || {});
    Object.assign(products, chunk.data?.products || {});
  }
  const parts = Object.entries(items).map(([id, raw]) => toPart(id, raw));
  const partMap = new Map(parts.map((part) => [part.id, part]));
  const productList = Object.entries(products).map(([id, raw]) => {
    const product: Product = {
      id,
      name: String(raw.name || id),
      category: String(raw.category || "Uncategorised"),
      sourcePage: String(raw.sourcePage || ""),
      variantIds: raw.variantIds || [],
      spareIds: raw.spareIds || [],
      attrCols: raw.attrCols || [],
      roles: raw.roles?.length ? raw.roles : DEF_ROLES.slice(),
      moduleWidth: 0,
      notes: String(raw.notes || ""),
      custom: Boolean(raw.custom),
      copiedFrom: String(raw.copiedFrom || ""),
    };
    product.moduleWidth = raw.moduleWidth == null ? defaultModule(product, partMap) : Number(raw.moduleWidth) || 0;
    return product;
  });
  return { parts, products: productList };
}
