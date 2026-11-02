export const LEVELS = ["Product", "Part", "Component", "Item"] as const;
export type Level = (typeof LEVELS)[number];

export const VIEWS = [
  { id: "tasks", label: "Tasks" },
  { id: "sales", label: "Sales" },
  { id: "products", label: "Products" },
  { id: "items", label: "Items" },
  { id: "stock", label: "Stock" },
  { id: "orders", label: "Orders" },
  { id: "purchasing", label: "Purchasing" },
  { id: "expenses", label: "Expenses" },
  { id: "register", label: "Document library" },
] as const;

export type ViewId = (typeof VIEWS)[number]["id"];

export const DOC_TYPES = [
  { code: "GA", label: "GA drawing", hint: "General arrangement drawing" },
  { code: "MFR", label: "Manufacturer's drawing", hint: "OEM / supplier drawing" },
  { code: "IIOM", label: "IIOM manual", hint: "Installation, inspection, operation & maintenance" },
  { code: "OTH", label: "Other documents", hint: "Datasheets, certificates, test reports" },
] as const;

export const STAGES = [
  ["lead", "Lead"],
  ["quote", "Quote"],
  ["po", "PO received"],
  ["production", "Production"],
  ["ready", "Ready"],
  ["dispatched", "Dispatched"],
  ["invoiced", "Invoiced"],
  ["closed", "Closed · paid"],
  ["lost", "Lost"],
] as const;

export const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES);

export const PO_STATUSES = [
  ["draft", "Draft"],
  ["sent", "Sent"],
  ["part", "Part received"],
  ["received", "Received"],
  ["cancelled", "Cancelled"],
] as const;

export const PO_LABEL: Record<string, string> = Object.fromEntries(PO_STATUSES);

export const RFQ_STATUSES = [
  ["draft", "Draft"],
  ["sent", "Sent"],
  ["quoted", "Quoted"],
  ["ordered", "Ordered"],
  ["cancelled", "Cancelled"],
] as const;

export const ORDER_STATUSES = [
  ["open", "To build"],
  ["built", "Built · awaiting dispatch"],
  ["sold", "Dispatched"],
] as const;

export const ORDER_LABEL: Record<string, string> = Object.fromEntries(ORDER_STATUSES);

export const EXP_CATS: [string, string][] = [
  ["Motor vehicle & fuel", "449"],
  ["Freight & courier", "425"],
  ["Tools & consumables", "429"],
  ["Repairs & maintenance", "473"],
  ["Rent", "469"],
  ["Light & power", "445"],
  ["Telephone & internet", "489"],
  ["Subscriptions & software", "485"],
  ["Office & stationery", "453"],
  ["Advertising & marketing", "400"],
  ["Travel & accommodation", "493"],
  ["Meals & entertainment", "420"],
  ["Insurance", "433"],
  ["Accounting & legal", "412"],
  ["Bank fees", "404"],
  ["General", "429"],
];

export const EXP_ACCT: Record<string, string> = Object.fromEntries(EXP_CATS);
export const PAID_BY = ["Business bank account", "Business card", "Personal (reimburse)", "Cash"];

export const DEF_ROLES = ["Tensioner", "Pole", "Arm", "Cushion", "Tip / Blade", "Frame", "Accessories"];
export const MOD_ROLES = ["Tip / Blade", "Arm", "Cushion"];
export const GST = 0.1;
export const HIST_DAYS = 60;
export const APPROVAL_QUOTE = 20_000;
export const LIST_MAX = 300;

export type BomLine = { partId: string; qty: number; role?: string; perModule?: number };

export type Part = {
  id: string;
  partNo: string;
  orderNo: string;
  description: string;
  category: string;
  sourcePage: string;
  kind: string;
  material: string;
  width: number | null;
  attrs: Record<string, string>;
  weight: string;
  makeBuy: string;
  productIds: string[];
  role: string;
  level: string;
  components: BomLine[];
  labour: number;
  supplier: string;
  notes: string;
  tempCode: boolean;
  catalog: boolean;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  sourcePage: string;
  variantIds: string[];
  spareIds: string[];
  attrCols: string[];
  roles: string[];
  moduleWidth: number;
  notes: string;
  custom: boolean;
  copiedFrom: string;
};

export type QuoteLine = {
  itemId: string | null;
  code: string;
  desc: string;
  qty: number;
  price: number;
  disc: number;
};

export type Quote = {
  no: string;
  rev?: string;
  date: string;
  valid: number;
  leadTime: string;
  sentAt: string;
  terms: string;
  lines: QuoteLine[];
  approved?: boolean;
};

export type DocketLine = {
  li: number;
  itemId: string | null;
  code: string;
  desc: string;
  ordered: number;
  supplied: number;
  price: number;
  disc: number;
};

export type Docket = {
  docketNo: string;
  date: string;
  carrier: string;
  connote: string;
  packages: string;
  weight: string;
  address: string;
  attn: string;
  backOrder: boolean;
  lines: DocketLine[];
};

export type Invoice = {
  no: string;
  date: string;
  due: string;
  docketNo: string;
  amount: number;
  paid: boolean;
  paidAt?: string;
};

export type Activity = { at: string; note: string; by: string };

export type Deal = {
  id: string;
  no: string;
  customerId: string;
  contact: string;
  source: string;
  title: string;
  value: number;
  stage: string;
  nextDate: string;
  nextAction: string;
  notes: string;
  owner: string;
  createdAt: string;
  closedAt?: string;
  lostReason?: string;
  quote?: Quote;
  po?: { no: string; date: string; value: number; required: string };
  dockets: Docket[];
  invoices: Invoice[];
  history: Activity[];
};

export type Contact = { name: string; role: string; email: string; phone: string };

export type Customer = {
  id: string;
  name: string;
  abn: string;
  site: string;
  address: string;
  terms: number;
  contacts: Contact[];
};

export type SupplierItem = { supCode: string; price: number; moq: number; lead: number };

export type Supplier = {
  id: string;
  name: string;
  abn: string;
  email: string;
  phone: string;
  lead: number;
  items: Record<string, SupplierItem>;
  contacts: { name: string; email: string; phone: string }[];
};

export type PoLine = { itemId: string; qty: number; price: number; received: number; supCode: string };

export type PurchaseOrder = {
  id: string;
  no: string;
  supplierId: string;
  status: string;
  date: string;
  expected: string;
  saleId: string;
  ref: string;
  lines: PoLine[];
};

export type Rfq = {
  id: string;
  no: string;
  supplierId: string;
  status: string;
  date: string;
  replyBy: string;
  lines: { itemId: string; qty: number; desc: string }[];
};

export type Expense = {
  id: string;
  no: string;
  date: string;
  payee: string;
  description: string;
  category: string;
  account: string;
  total: number;
  gst: number;
  gstFree: boolean;
  paidBy: string;
  ref: string;
  saleId: string | null;
  reimbursed: boolean;
  notes: string;
  receiptName?: string;
  xeroAt?: string;
};

export type BuildOrder = {
  id: string;
  no: string;
  itemId: string;
  qty: number;
  sell: number;
  customer: string;
  ref: string;
  due: string;
  notes: string;
  status: "open" | "built" | "sold";
  dealId: string;
  createdAt: string;
  builtAt?: string;
  soldAt?: string;
  costTotal?: number;
};

export type DocRecord = {
  id: string;
  partId: string;
  type: string;
  rev: string;
  revIndex: number;
  filedName: string;
  originalName: string;
  uploadedAt: string;
  uploadedBy: string;
  sizeBytes: number;
};

export type Company = {
  name: string;
  legal: string;
  abn: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  web: string;
  contact: string;
  contactRole: string;
  contactPhone: string;
  contactEmail: string;
  deliverTo: string;
  quoteTerms: string;
  poTerms: string;
  bankName: string;
  bankBsb: string;
  bankAcct: string;
  bankAcctName: string;
  xeroSales: string;
  xeroPurch: string;
  xeroTaxSales: string;
  xeroTaxPurch: string;
};

export type Price = { buy: number | null; sell: number | null };
export type StockRec = {
  onHand: number | null;
  min: number | null;
  reorder: number | null;
  location: string;
  supplierId: string;
  updatedAt?: string;
};
export type StockMove = {
  id: string;
  itemId: string;
  type: string;
  qty: number;
  after: number;
  note: string;
  at: string;
  by: string;
};
export type PriceLog = { id: string; itemId: string; buy: number; at: string; source: string };
export type StaffUser = { email: string; name: string; title: string; role: string };

export type Me = { email: string; name: string; role: "admin" | "editor" | "viewer"; title: string };

export type AttentionItem = {
  key: string;
  rule: string;
  severity: "approval" | "overdue" | "due";
  label: string;
  title: string;
  detail: string;
  owner: string;
  age: number;
  coll: "deals" | "orders" | "pos" | "rfqs" | "items";
  id: string;
  escalate: boolean;
  requester?: string;
  saleId?: string;
};

export type AlertRuleSetting = { on: boolean; days: number };

export type AlertSettings = { rules: Record<string, AlertRuleSetting> };

export type AlertState = {
  key: string;
  snoozedUntil?: string;
  dismissed?: boolean;
  reason?: string;
};

export type BackupStatus = {
  runs: { at: string; trigger: string; ok: boolean; error?: string; documents?: number; files_new?: number; bytes?: number; location?: string }[];
  targets: string[];
  overdue: boolean;
  lastOk: string | null;
};

export type Workspace = {
  company: Company;
  customers: Customer[];
  suppliers: Supplier[];
  deals: Deal[];
  orders: BuildOrder[];
  pos: PurchaseOrder[];
  rfqs: Rfq[];
  expenses: Expense[];
  docs: DocRecord[];
  prices: Record<string, Price>;
  stock: Record<string, StockRec>;
  moves: StockMove[];
  priceLog: PriceLog[];
  users: StaffUser[];
};

export type CatalogPayload = { parts: Part[]; products: Product[] };

export const COMPANY_DEFAULT: Company = {
  name: "PCS",
  legal: "",
  abn: "",
  tagline: "White Label Conveyor Products",
  address: "",
  phone: "",
  email: "",
  web: "",
  contact: "Jack Morris",
  contactRole: "Operations Manager",
  contactPhone: "0408 081 703",
  contactEmail: "",
  deliverTo: "",
  quoteTerms: "Prices in AUD ex GST. Delivery ex works unless stated. Payment 30 days from invoice.",
  poTerms: "Please quote our PO number on all delivery dockets and invoices.",
  bankName: "",
  bankBsb: "",
  bankAcct: "",
  bankAcctName: "",
  xeroSales: "200",
  xeroPurch: "300",
  xeroTaxSales: "GST on Income",
  xeroTaxPurch: "GST on Expenses",
};

export const FULL_BLEED: ViewId[] = ["tasks", "sales", "stock", "orders", "purchasing", "expenses", "register"];
