"use client";

import { Button, TextButton } from "@/components/ui/button";
import { SearchInput, SelectInput } from "@/components/ui/field";
import { EmptyState, PageHead, Panel, Tile, Tiles } from "@/components/ui/panel";
import { DataTable, Td, Th } from "@/components/ui/table";
import { downloadCsv } from "@/lib/domain/download";
import { fmtDate, money, monthLabel, todayISO } from "@/lib/domain/format";
import { EXP_CATS } from "@/lib/domain/types";
import { useOps } from "@/components/providers/ops-provider";

const net = (expense: { total: number; gst: number }) => expense.total - expense.gst;

export function ExpensesView() {
  const ops = useOps();
  if (!ops.data) return <Panel><EmptyState>Loading…</EmptyState></Panel>;
  const month = ops.expenseMonth || todayISO().slice(0, 7);
  const query = ops.expenseQuery.toLowerCase();
  const inMonth = ops.data.expenses.filter((expense) => expense.date.startsWith(month));
  const list = (ops.expenseAll ? ops.data.expenses : inMonth)
    .filter((expense) => (ops.expenseCat === "all" || expense.category === ops.expenseCat) && (!query || [expense.no, expense.payee, expense.description, expense.category, expense.ref].join(" ").toLowerCase().includes(query)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no, undefined, { numeric: true }));
  const missing = ops.data.expenses.filter((expense) => !expense.receiptName).length;
  const notXero = ops.data.expenses.filter((expense) => !expense.xeroAt).length;
  const reimburse = ops.data.expenses.filter((expense) => expense.paidBy === "Personal (reimburse)" && !expense.reimbursed).reduce((sum, expense) => sum + expense.total, 0);
  const byCat: Record<string, number> = {};
  for (const expense of inMonth) byCat[expense.category] = (byCat[expense.category] || 0) + net(expense);
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return (
    <Panel>
      <PageHead
        eyebrow="Non-stock spending · receipts · GST · Xero"
        title="Expenses"
        actions={
          <>
            <Button tone="primary" onClick={() => ops.openModal({ type: "expense" })}>+ New expense</Button>
            <Button onClick={() => { downloadCsv(`expenses_${todayISO()}.csv`, [["No", "Date", "Payee", "Description", "Total"], ...ops.data!.expenses.map((expense) => [expense.no, expense.date, expense.payee, expense.description, expense.total])]); ops.toast("Expenses exported"); }}>Export</Button>
          </>
        }
      >
        <Tiles>
          <Tile label={`Spent in ${monthLabel(month)}`} value={money(inMonth.reduce((sum, expense) => sum + expense.total, 0))} note={`${money(inMonth.reduce((sum, expense) => sum + net(expense), 0))} ex GST · GST ${money(inMonth.reduce((sum, expense) => sum + expense.gst, 0))}`} />
          <Tile label="Biggest categories this month" value={<span className="font-sans text-[13px] leading-5 font-normal">{top.length ? top.map(([name, value]) => <span key={name} className="block">{name} <strong>{money(value)}</strong></span>) : "—"}</span>} />
          <Tile label="Missing receipts" value={missing} warn={missing > 0} note={`${notXero} not yet sent to Xero`} />
          <Tile label="To reimburse staff" value={money(reimburse)} />
        </Tiles>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted">Month
            <input className="rounded-app border border-line bg-sunk px-2 py-1.5" type="month" value={month} disabled={ops.expenseAll} onChange={(event) => ops.setExpenseMonth(event.target.value)} />
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <input type="checkbox" checked={ops.expenseAll} onChange={(event) => ops.setExpenseAll(event.target.checked)} /> All dates
          </label>
          <SelectInput className="w-auto" aria-label="Category" value={ops.expenseCat} onChange={(event) => ops.setExpenseCat(event.target.value)}>
            <option value="all">All categories</option>
            {EXP_CATS.map(([category]) => <option key={category}>{category}</option>)}
          </SelectInput>
          <SearchInput className="max-w-[280px]" placeholder="Search payee, description, sale" value={ops.expenseQuery} onChange={(event) => ops.setExpenseQuery(event.target.value)} />
        </div>
      </PageHead>
      <div className="px-4 pb-[18px]">
        {!list.length ? (
          <EmptyState title={`No expenses ${ops.expenseAll ? "yet" : "this month"}`}>Log fuel, freight, tools, rent, subscriptions and other spending that isn’t stock bought on a purchase order.</EmptyState>
        ) : (
          <DataTable>
            <thead>
              <tr><Th>No.</Th><Th>Date</Th><Th>Payee</Th><Th>Description</Th><Th>Category</Th><Th numeric>Ex GST</Th><Th numeric>GST</Th><Th numeric>Total</Th><Th>Paid by</Th><Th>Receipt</Th><Th>Sale</Th><Th>Xero</Th></tr>
            </thead>
            <tbody>
              {list.map((expense) => {
                const sale = ops.data?.deals.find((deal) => deal.id === expense.saleId);
                return (
                  <tr key={expense.id}>
                    <Td><TextButton className="font-mono" onClick={() => ops.openModal({ type: "expense", id: expense.id })}>{expense.no}</TextButton></Td>
                    <Td className="text-muted whitespace-nowrap">{fmtDate(expense.date)}</Td>
                    <Td>{expense.payee}</Td>
                    <Td>{expense.description}</Td>
                    <Td className="text-muted">{expense.category}</Td>
                    <Td numeric>{money(net(expense))}</Td>
                    <Td numeric className="text-muted">{expense.gstFree ? "Free" : money(expense.gst)}</Td>
                    <Td numeric>{money(expense.total)}</Td>
                    <Td className="text-muted">{expense.paidBy}{expense.paidBy === "Personal (reimburse)" ? expense.reimbursed ? " ✓" : " Owed" : ""}</Td>
                    <Td>{expense.receiptName ? <span className="text-[12.5px]">{expense.receiptName}</span> : <span className="rounded-[3px] bg-rev-soft px-1.5 py-px text-[11px] font-semibold text-rev uppercase">None</span>}</Td>
                    <Td className="font-mono text-muted">{sale?.no}</Td>
                    <Td className="text-muted">{expense.xeroAt ? "✓" : ""}</Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </div>
    </Panel>
  );
}
