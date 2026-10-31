"use client";

import { ExpensesView } from "@/components/expenses/expenses-view";
import { ItemWorkspace } from "@/components/items/item-workspace";
import { LibraryView } from "@/components/library/library-view";
import { ModalHost } from "@/components/modals/modal-host";
import { OrdersView } from "@/components/orders/orders-view";
import { ProductWorkspace } from "@/components/products/product-workspace";
import { OpsProvider, useOps } from "@/components/providers/ops-provider";
import { PurchasingView } from "@/components/purchasing/purchasing-view";
import { SalesView } from "@/components/sales/sales-view";
import { AppBar, isFullBleed } from "@/components/shell/app-bar";
import { SideList } from "@/components/shell/side-list";
import { StockView } from "@/components/stock/stock-view";
import { EmptyState, Panel } from "@/components/ui/panel";

export function AppShell() {
  return (
    <OpsProvider>
      <Shell />
    </OpsProvider>
  );
}

function Shell() {
  const ops = useOps();
  const full = isFullBleed(ops.view);
  return (
    <>
      <AppBar />
      <div className={`mx-auto grid max-w-[1500px] gap-4 px-[max(16px,env(safe-area-inset-right))] py-4 pl-[max(16px,env(safe-area-inset-left))] ${full ? "" : "min-[861px]:grid-cols-[300px_minmax(0,1fr)]"}`}>
        {full ? null : <SideList />}
        <main className="grid min-w-0 content-start gap-4">
          {ops.error ? <Panel><EmptyState title="Could not connect">{ops.error}</EmptyState></Panel> : <Workspace />}
        </main>
      </div>
      <ModalHost />
      {ops.toastMessage ? (
        <div className="fixed bottom-[calc(16px+env(safe-area-inset-bottom,0px))] left-1/2 z-[100] max-w-[calc(100%-32px)] -translate-x-1/2 rounded-app bg-ink px-3.5 py-2 text-[13px] text-bg">
          {ops.toastMessage}
        </div>
      ) : null}
    </>
  );
}

function Workspace() {
  const ops = useOps();
  if (ops.view === "sales") return <SalesView />;
  if (ops.view === "products") return <ProductWorkspace />;
  if (ops.view === "items") return <ItemWorkspace />;
  if (ops.view === "stock") return <StockView />;
  if (ops.view === "orders") return <OrdersView />;
  if (ops.view === "purchasing") return <PurchasingView />;
  if (ops.view === "expenses") return <ExpensesView />;
  return <LibraryView />;
}
