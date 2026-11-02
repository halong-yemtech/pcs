"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { activeItems, attentionPayload, defaultAlertSettings, evaluateAttention, isApprover, itemFor } from "@/lib/domain/attention";
import { compareCodes } from "@/lib/domain/bom";
import { addDays, fmtDate, revLabel, todayISO } from "@/lib/domain/format";
import type {
  AlertSettings,
  AlertState,
  AttentionItem,
  BackupStatus,
  BuildOrder,
  Company,
  Customer,
  Deal,
  DocRecord,
  Expense,
  Me,
  Part,
  Price,
  Product,
  StockMove,
  StockRec,
  ViewId,
  Workspace,
} from "@/lib/domain/types";

export type ModalState =
  | { type: "company" }
  | { type: "item"; id?: string }
  | { type: "attention" }
  | { type: "lead" }
  | { type: "deal"; id: string }
  | { type: "expense"; id?: string; saleId?: string }
  | { type: "customer"; id?: string }
  | { type: "supplier"; id?: string }
  | { type: "po"; id: string }
  | { type: "product"; id?: string }
  | { type: "cell"; productId: string; variantId: string; role: string }
  | { type: "stock-move"; id: string; move: "receive" | "issue" | "adjust" }
  | { type: "team" }
  | { type: "backups" }
  | { type: "rules" };

type Data = Workspace & { parts: Part[]; products: Product[] };

type OpsContextValue = {
  ready: boolean;
  error: string | null;
  me: Me | null;
  status: string;
  data: Data | null;
  partMap: Map<string, Part>;
  productMap: Map<string, Product>;
  sortedParts: Part[];
  usedBy: Map<string, string[]>;
  attention: AttentionItem[];
  mineAttention: AttentionItem[];
  alertStates: AlertState[];
  alertSettings: AlertSettings;
  backup: BackupStatus | null;
  approver: boolean;
  taskTab: "mine" | "all";
  setTaskTab: (tab: "mine" | "all") => void;
  snoozeAttention: (key: string, days: number) => void;
  dismissAttention: (key: string, reason: string) => void;
  restoreAttention: (key: string) => void;
  saveAlertSettings: (settings: AlertSettings) => void;
  saveUser: (email: string, patch: { role?: string; title?: string; name?: string }) => void;
  runBackup: () => Promise<void>;
  view: ViewId;
  setView: (view: ViewId) => void;
  itemQuery: string;
  setItemQuery: (value: string) => void;
  itemFilter: string;
  setItemFilter: (value: string) => void;
  productQuery: string;
  setProductQuery: (value: string) => void;
  selectedId: string | null;
  itemTab: "structure" | "stock" | "costing" | "documents";
  selectItem: (id: string, tab?: OpsContextValue["itemTab"]) => void;
  setItemTab: (tab: OpsContextValue["itemTab"]) => void;
  productId: string | null;
  productTab: "matrix" | "variants" | "build" | "spares";
  material: string;
  selectProduct: (id: string) => void;
  setProductTab: (tab: OpsContextValue["productTab"]) => void;
  setMaterial: (value: string) => void;
  salesTab: string;
  setSalesTab: (value: string) => void;
  salesQuery: string;
  setSalesQuery: (value: string) => void;
  showLost: boolean;
  setShowLost: (value: boolean) => void;
  historyFy: string;
  setHistoryFy: (value: string) => void;
  stockQuery: string;
  setStockQuery: (value: string) => void;
  stockFilter: string;
  setStockFilter: (value: string) => void;
  stockLevel: string;
  setStockLevel: (value: string) => void;
  orderTab: "open" | "built" | "sold";
  setOrderTab: (value: "open" | "built" | "sold") => void;
  orderQuery: string;
  setOrderQuery: (value: string) => void;
  selectedOrderId: string | null;
  setSelectedOrderId: (id: string | null) => void;
  purchTab: string;
  setPurchTab: (value: string) => void;
  purchQuery: string;
  setPurchQuery: (value: string) => void;
  expenseMonth: string;
  setExpenseMonth: (value: string) => void;
  expenseAll: boolean;
  setExpenseAll: (value: boolean) => void;
  expenseCat: string;
  setExpenseCat: (value: string) => void;
  expenseQuery: string;
  setExpenseQuery: (value: string) => void;
  libQuery: string;
  setLibQuery: (value: string) => void;
  libLevel: string;
  setLibLevel: (value: string) => void;
  libMiss: string;
  setLibMiss: (value: string) => void;
  libType: string;
  setLibType: (value: string) => void;
  libDocQuery: string;
  setLibDocQuery: (value: string) => void;
  libSelected: string | null;
  setLibSelected: (id: string | null) => void;
  collapsed: Set<string>;
  toggleCollapsed: (key: string) => void;
  setCollapsed: (keys: Set<string>) => void;
  buildQty: number;
  setBuildQty: (qty: number) => void;
  modal: ModalState | null;
  openModal: (modal: ModalState) => void;
  closeModal: () => void;
  toast: (message: string) => void;
  toastMessage: string | null;
  findByNo: (code: string) => string | null;
  customerName: (id?: string) => string;
  supplierName: (id?: string) => string;
  patchPart: (id: string, patch: Partial<Part>) => void;
  addPart: (part: Part) => void;
  patchProduct: (id: string, patch: Partial<Product>) => void;
  addProduct: (product: Product) => void;
  setPrice: (id: string, patch: Partial<Price>, note?: string) => void;
  setStock: (id: string, patch: Partial<StockRec>) => void;
  moveStock: (id: string, qty: number, type: string, note: string) => void;
  saveDeal: (deal: Deal, note?: string) => void;
  saveCustomer: (customer: Customer) => void;
  saveOrder: (order: BuildOrder) => void;
  saveExpense: (expense: Expense) => void;
  saveCompany: (company: Company) => void;
  fileDocument: (partId: string, type: string, file: File) => void;
  refreshAttention: () => void;
};

const OpsContext = createContext<OpsContextValue | null>(null);

export function useOps() {
  const value = useContext(OpsContext);
  if (!value) throw new Error("useOps must be used inside OpsProvider");
  return value;
}

const emptyStock = (): StockRec => ({ onHand: null, min: null, reorder: null, location: "", supplierId: "" });

export function OpsProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [alertStates, setAlertStates] = useState<AlertState[]>([]);
  const [alertSettings, setAlertSettings] = useState<AlertSettings>(defaultAlertSettings);
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<ViewId>("tasks");
  const [taskTab, setTaskTab] = useState<"mine" | "all">("mine");
  const [itemQuery, setItemQuery] = useState("");
  const [itemFilter, setItemFilter] = useState("all");
  const [productQuery, setProductQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [itemTab, setItemTab] = useState<OpsContextValue["itemTab"]>("structure");
  const [productId, setProductId] = useState<string | null>(null);
  const [productTab, setProductTab] = useState<OpsContextValue["productTab"]>("matrix");
  const [material, setMaterial] = useState("all");
  const [salesTab, setSalesTab] = useState("pipeline");
  const [salesQuery, setSalesQuery] = useState("");
  const [showLost, setShowLost] = useState(false);
  const [historyFy, setHistoryFy] = useState("all");
  const [stockQuery, setStockQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [stockLevel, setStockLevel] = useState("all");
  const [orderTab, setOrderTab] = useState<"open" | "built" | "sold">("open");
  const [orderQuery, setOrderQuery] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [purchTab, setPurchTab] = useState("open");
  const [purchQuery, setPurchQuery] = useState("");
  const [expenseMonth, setExpenseMonth] = useState(todayISO().slice(0, 7));
  const [expenseAll, setExpenseAll] = useState(false);
  const [expenseCat, setExpenseCat] = useState("all");
  const [expenseQuery, setExpenseQuery] = useState("");
  const [libQuery, setLibQuery] = useState("");
  const [libLevel, setLibLevel] = useState("all");
  const [libMiss, setLibMiss] = useState("all");
  const [libType, setLibType] = useState("all");
  const [libDocQuery, setLibDocQuery] = useState("");
  const [libSelected, setLibSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [buildQty, setBuildQty] = useState(1);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function toast(message: string) {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage((current) => (current === message ? null : current)), 3000);
  }

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [catalogRes, workspaceRes, meRes] = await Promise.all([
          fetch("/api/catalog"),
          fetch("/api/workspace"),
          fetch("/api/me"),
        ]);
        if (!catalogRes.ok || !workspaceRes.ok || !meRes.ok) throw new Error("load");
        const catalog = await catalogRes.json();
        const workspace = await workspaceRes.json();
        const person = await meRes.json();
        if (cancel) return;
        const { attention, ...rest } = workspace;
        void attention;
        const next = { ...rest, parts: catalog.parts, products: catalog.products };
        setData(next);
        setAttention(evaluateAttention(attentionPayload({ ...next, settings: defaultAlertSettings() })));
        setMe(person);
        setReady(true);
        if (person.role === "admin") {
          fetch("/api/admin/backups").then(async (res) => { if (res.ok) setBackup(await res.json()); }).catch(() => undefined);
        }
      } catch (loadError) {
        console.error("operations load failed", loadError);
        if (!cancel) setError("Could not load the product database.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const snapshot = useMemo(
    () => (data ? attentionPayload({ ...data, settings: alertSettings }) : null),
    [data, alertSettings],
  );

  useEffect(() => {
    if (!dirty || !snapshot) return;
    setAttention(evaluateAttention(snapshot));
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/attention", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(snapshot),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const body = await res.json();
          if (Array.isArray(body.items)) setAttention(body.items);
        })
        .catch((refreshError) => {
          if (refreshError instanceof DOMException && refreshError.name === "AbortError") return;
          console.error("attention refresh failed", refreshError);
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [dirty, snapshot]);

  const partMap = useMemo(() => new Map((data?.parts || []).map((part) => [part.id, part])), [data?.parts]);
  const productMap = useMemo(() => new Map((data?.products || []).map((product) => [product.id, product])), [data?.products]);
  const sortedParts = useMemo(() => [...(data?.parts || [])].sort(compareCodes), [data?.parts]);
  const usedBy = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const part of data?.parts || []) {
      for (const line of part.components) {
        if (!line.partId || line.qty <= 0) continue;
        const list = map.get(line.partId) || [];
        list.push(part.id);
        map.set(line.partId, list);
      }
    }
    return map;
  }, [data?.parts]);

  function mark() {
    setDirty(true);
  }

  function update(recipe: (current: Data) => Data) {
    setData((current) => (current ? recipe(current) : current));
    mark();
  }

  const value: OpsContextValue = {
    ready,
    error,
    me,
    status: !ready ? (error ? "Offline" : "Connecting…") : `${(data?.parts.length || 0).toLocaleString("en-AU")} items · ${me?.name || "Signed in"}`,
    data,
    partMap,
    productMap,
    sortedParts,
    usedBy,
    attention: activeItems(attention, alertStates),
    mineAttention: activeItems(attention, alertStates).filter((entry) => itemFor(entry, me, data?.users || [])),
    alertStates,
    alertSettings,
    backup,
    approver: isApprover(me?.email || "", me?.role || "viewer", data?.users || []),
    taskTab,
    setTaskTab,
    snoozeAttention: (key, days) => {
      const until = addDays(todayISO(), days);
      setAlertStates((current) => {
        const next = current.filter((state) => state.key !== key);
        next.push({ key, snoozedUntil: until });
        return next;
      });
      toast(`Snoozed until ${fmtDate(until)}`);
    },
    dismissAttention: (key, reason) => {
      setAlertStates((current) => {
        const next = current.filter((state) => state.key !== key);
        next.push({ key, dismissed: true, reason });
        return next;
      });
      toast("Dismissed until something changes");
    },
    restoreAttention: (key) => setAlertStates((current) => current.filter((state) => state.key !== key)),
    saveAlertSettings: (settings) => {
      setAlertSettings(settings);
      setDirty(true);
      toast("Alert settings saved");
    },
    saveUser: (email, patch) => {
      update((current) => ({
        ...current,
        users: current.users.some((user) => user.email === email)
          ? current.users.map((user) => (user.email === email ? { ...user, ...patch } : user))
          : [...current.users, { email, name: patch.name || email, title: patch.title || "", role: patch.role || "editor" }],
      }));
      toast("Access updated");
    },
    runBackup: async () => {
      const res = await fetch("/api/admin/backups", { method: "POST" });
      const body = await res.json();
      if (body.ok) toast(`Backed up ${body.documents} records`);
      else toast(body.error || "Backup failed");
      const status = await fetch("/api/admin/backups");
      if (status.ok) setBackup(await status.json());
    },
    view,
    setView,
    itemQuery,
    setItemQuery,
    itemFilter,
    setItemFilter,
    productQuery,
    setProductQuery,
    selectedId,
    itemTab,
    selectItem: (id, tab) => {
      setSelectedId(id);
      if (tab) setItemTab(tab);
      setView("items");
    },
    setItemTab,
    productId,
    productTab,
    material,
    selectProduct: (id) => {
      setProductId(id);
      setMaterial("all");
      setProductTab("matrix");
      setView("products");
    },
    setProductTab,
    setMaterial,
    salesTab,
    setSalesTab,
    salesQuery,
    setSalesQuery,
    showLost,
    setShowLost,
    historyFy,
    setHistoryFy,
    stockQuery,
    setStockQuery,
    stockFilter,
    setStockFilter,
    stockLevel,
    setStockLevel,
    orderTab,
    setOrderTab,
    orderQuery,
    setOrderQuery,
    selectedOrderId,
    setSelectedOrderId,
    purchTab,
    setPurchTab,
    purchQuery,
    setPurchQuery,
    expenseMonth,
    setExpenseMonth,
    expenseAll,
    setExpenseAll,
    expenseCat,
    setExpenseCat,
    expenseQuery,
    setExpenseQuery,
    libQuery,
    setLibQuery,
    libLevel,
    setLibLevel,
    libMiss,
    setLibMiss,
    libType,
    setLibType,
    libDocQuery,
    setLibDocQuery,
    libSelected,
    setLibSelected,
    collapsed,
    toggleCollapsed: (key) => {
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    setCollapsed,
    buildQty,
    setBuildQty,
    modal,
    openModal: setModal,
    closeModal: () => setModal(null),
    toast,
    toastMessage,
    findByNo: (code) => {
      const query = code.trim().toLowerCase();
      if (!query || !data) return null;
      if (partMap.has(query)) return query;
      const byPart = data.parts.find((part) => part.partNo.toLowerCase() === query);
      if (byPart) return byPart.id;
      const byOrder = data.parts.find((part) => part.orderNo.toLowerCase() === query);
      return byOrder?.id || null;
    },
    customerName: (id) => data?.customers.find((customer) => customer.id === id)?.name || "",
    supplierName: (id) => data?.suppliers.find((supplier) => supplier.id === id)?.name || "",
    patchPart: (id, patch) => update((current) => ({ ...current, parts: current.parts.map((part) => (part.id === id ? { ...part, ...patch } : part)) })),
    addPart: (part) => update((current) => ({ ...current, parts: [...current.parts, part] })),
    patchProduct: (id, patch) =>
      update((current) => ({ ...current, products: current.products.map((product) => (product.id === id ? { ...product, ...patch } : product)) })),
    addProduct: (product) => update((current) => ({ ...current, products: [...current.products, product] })),
    setPrice: (id, patch, note) =>
      update((current) => {
        const prev = current.prices[id] || { buy: null, sell: null };
        const next = { ...prev, ...patch };
        const log =
          patch.buy != null && patch.buy !== prev.buy
            ? [{ id: crypto.randomUUID(), itemId: id, buy: patch.buy, at: new Date().toISOString(), source: note || "Edited in the register" }, ...current.priceLog]
            : current.priceLog;
        return { ...current, prices: { ...current.prices, [id]: next }, priceLog: log };
      }),
    setStock: (id, patch) =>
      update((current) => ({
        ...current,
        stock: { ...current.stock, [id]: { ...emptyStock(), ...current.stock[id], ...patch, updatedAt: new Date().toISOString() } },
      })),
    moveStock: (id, qty, type, note) =>
      update((current) => {
        const prev = { ...emptyStock(), ...current.stock[id] };
        const before = prev.onHand ?? 0;
        const after = type === "adjust" ? qty : before + qty;
        const move: StockMove = {
          id: crypto.randomUUID(),
          itemId: id,
          type,
          qty: type === "adjust" ? after - before : qty,
          after,
          note,
          at: new Date().toISOString(),
          by: me?.email || "",
        };
        return { ...current, stock: { ...current.stock, [id]: { ...prev, onHand: after, updatedAt: move.at } }, moves: [move, ...current.moves] };
      }),
    saveCustomer: (customer) =>
      update((current) => {
        const exists = current.customers.some((item) => item.id === customer.id);
        return { ...current, customers: exists ? current.customers.map((item) => (item.id === customer.id ? customer : item)) : [...current.customers, customer] };
      }),
    saveDeal: (deal, note) =>
      update((current) => {
        const history = note ? [{ at: new Date().toISOString(), note, by: me?.email || "" }, ...deal.history] : deal.history;
        const next = { ...deal, history };
        const exists = current.deals.some((item) => item.id === next.id);
        return { ...current, deals: exists ? current.deals.map((item) => (item.id === next.id ? next : item)) : [next, ...current.deals] };
      }),
    saveOrder: (order) =>
      update((current) => {
        const exists = current.orders.some((item) => item.id === order.id);
        return { ...current, orders: exists ? current.orders.map((item) => (item.id === order.id ? order : item)) : [order, ...current.orders] };
      }),
    saveExpense: (expense) =>
      update((current) => {
        const exists = current.expenses.some((item) => item.id === expense.id);
        return { ...current, expenses: exists ? current.expenses.map((item) => (item.id === expense.id ? expense : item)) : [expense, ...current.expenses] };
      }),
    saveCompany: (company) => update((current) => ({ ...current, company })),
    fileDocument: (partId, type, file) =>
      update((current) => {
        const part = current.parts.find((item) => item.id === partId);
        const same = current.docs.filter((doc) => doc.partId === partId && doc.type === type);
        const revIndex = same.reduce((max, doc) => Math.max(max, doc.revIndex), -1) + 1;
        const rev = revLabel(revIndex);
        const doc: DocRecord = {
          id: crypto.randomUUID(),
          partId,
          type,
          rev,
          revIndex,
          filedName: `${part?.partNo || partId}-${type}-Rev${rev}`,
          originalName: file.name,
          uploadedAt: new Date().toISOString(),
          uploadedBy: me?.email || "",
          sizeBytes: file.size,
        };
        return { ...current, docs: [doc, ...current.docs] };
      }),
    refreshAttention: () => setDirty(true),
  };

  return <OpsContext.Provider value={value}>{children}</OpsContext.Provider>;
}
