import { LandingFixture } from "./landing";
import { DashboardFixture } from "./dashboard";
import { LoadingFixture } from "./loading";
import { LoadingProvider } from "@/components/ui/global-loading-bar";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { notify } from "@/lib/notify";
import { OperationNotice } from "@/components/ui/operation-notice";
import { SalesView } from "@/components/sales-view";
import { ExpensesView } from "@/components/expenses-view";
import { MenuWorkspace } from "@/components/menu/menu-workspace";
import { LibrariesWorkspace } from "@/components/libraries/libraries-workspace";
import { PosWorkspace } from "@/components/pos/pos-workspace";
import { Input } from "@/components/ui/primitives/input";
import { Select } from "@/components/ui/select";
import { TableActionButton } from "@/components/ui/table-action-button";
import { Pencil } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ReceiptDialog } from "@/components/receipt-dialog";
import { ReceiptPrint } from "@/components/receipt-print";
import { useCallback, useEffect, useState } from "react";
import type { Sale, Expense } from "@/lib/sales/domain";
import { salesRange, shopDate } from "@/lib/sales/period";
import { createRoot } from "react-dom/client";
import { MutationForm } from "@/components/mutation-form";
import { FormDialog } from "@/components/ui/form-dialog";
import { NotificationProvider } from "@/components/ui/notification-provider";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import type { ActionState } from "@/lib/action-state";
import "@/app/tokens.css";
import "@/app/globals.css";
import "@/app/select.css";
import "@/app/calendar.css";
import "@/app/workspace.css";
import "@/app/dialogs.css";
import "@/app/notifications.css";
import "@/app/loading.css";
import "@/app/workspace-shell.css";
import "@/app/menu.css";
import "@/app/libraries.css";
import "@/app/sales.css";
import "@/app/dashboard.css";
import "@/app/expenses.css";
import "@/app/tables.css";
import "@/app/receipt.css";

declare global {
  interface Window {
    uiTestCalls: Record<string, string>[];
    uiTestDelay?: number;
  }
}
window.uiTestCalls = [];
async function save(
  _previous: ActionState,
  data: FormData,
): Promise<ActionState> {
  window.uiTestCalls.push(
    Object.fromEntries(
      Array.from(data, ([key, value]) => [key, String(value)]),
    ),
  );
  if (window.uiTestDelay)
    await new Promise((resolve) => setTimeout(resolve, window.uiTestDelay));
  return data.get("name") === "Fail"
    ? {
        status: "error",
        message: "This name could not be saved. Edit it and try again.",
      }
    : { status: "success", message: "Your record was saved." };
}
function Fixture() {
  const paginationFixture = new URLSearchParams(location.search).has("pagination");
  const [loading, setLoading] = useState(false);
  return (
    <NotificationProvider>
      <main className="workspace-content">
        {location.search.includes("notifications") && <section aria-label="Notification fixtures" style={{ paddingTop: 112, paddingBottom: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(["success", "error", "warning", "info"] as const).map(type =>
            <button className="button secondary compact" key={type} onClick={() => notify[type](`${type} notification`, { description: "A clear operation result with supporting details." })}>{type} notification</button>)}
          <button onClick={() => notify.error("Critical failure", { critical: true })}>Critical notification</button>
          <button onClick={() => { for (let i = 0; i < 6; i++) notify.info(`Operation ${i}`); }}>Rapid notifications</button>
          <button onClick={() => history.pushState({}, "", "/?notifications&navigated")}>Navigate with notification</button>
          {location.search.includes("redirect") && <OperationNotice title="Sign-in failed" description="Those credentials could not be verified." />}
        </section>}
        <div className="page-heading">
          <h1>Record management</h1>
          <FormDialog
            trigger="Add product"
            title="Add product"
            triggerClassName=""
          >
            <MutationForm action={save} submitLabel="Save product">
              <label className="field">
                Product name
                <input name="name" required />
              </label>
              <label className="field">
                Price
                <input name="price" inputMode="decimal" required />
              </label>
            </MutationForm>
          </FormDialog>
        </div>
        <Card>
          <CardHeader title="Products" />
          {paginationFixture && <button onClick={() => setLoading(value => !value)}>Toggle loading</button>}
          <DataTable
            caption="Products"
            isLoading={loading}
            columns={[
              { key: "name", label: "Product", sortable: true },
              { key: "price", label: "Price", sortable: true, numeric: true },
              { key: "actions", label: "Actions" },
            ]}
            rows={paginationFixture ? Array.from({ length: 53 }, (_, index) => ({
              id: String(index + 1),
              search: `Record ${String(index + 1).padStart(2, "0")} ${index < 23 ? "coffee" : "tea"}`,
              sort: { name: `Record ${String(index + 1).padStart(2, "0")}`, price: 53 - index },
              cells: { name: `Record ${String(index + 1).padStart(2, "0")}`, price: String(53 - index) },
            })) : [
              {
                id: "latte",
                search: "Latte coffee",
                sort: { name: "Latte", price: 145 },
                cells: {
                  name: "Latte",
                  price: "145.00",
                  actions: (
                    <FormDialog
                      trigger="Hide"
                      triggerLabel="Hide Latte"
                      title="Hide Latte?"
                      description="The item will be hidden from new sales. Its record remains saved."
                      confirmation
                      danger
                    >
                      <MutationForm action={save} submitLabel="Confirm hide">
                        <input type="hidden" name="action" value="hide" />
                      </MutationForm>
                    </FormDialog>
                  ),
                },
              },
              {
                id: "americano",
                search: "Americano coffee",
                sort: { name: "Americano", price: 100 },
                cells: { name: "Americano", price: "100.00" },
              },
            ]}
            searchPlaceholder="Search products"
          />
        </Card>
      </main>
    </NotificationProvider>
  );
}

function ControlsFixture() {
  return (
    <main className="auth-card">
      <h1>Shared controls</h1>
      <label className="field">Number<Input type="number" defaultValue="2" /></label>
      <label className="field">Read-only<Input readOnly value="Receipt total" /></label>
      <label className="field">Disabled<Input disabled value="Unavailable" /></label>
      <TableActionButton icon={Pencil} label="Unavailable edit" tooltip="Editing is unavailable" disabled />
    </main>
  );
}

function SelectFixture() {
  const [saved, setSaved] = useState("");
  return (
    <main className="auth-card">
      <h1>Select controls</h1>
      <form onSubmit={event => {
        event.preventDefault();
        setSaved(String(new FormData(event.currentTarget).get("category")));
      }}>
        <label className="field">Category<Select name="category" defaultValue="" options={[
          { value: "", label: "Uncategorized" },
          { value: "coffee", label: "Coffee" },
          { value: "unavailable", label: "Unavailable", disabled: true },
          ...Array.from({ length: 30 }, (_, index) => ({ value: `category-${index}`, label: `Category ${index + 1} with a longer descriptive label` })),
        ]} /></label>
        <label className="field">Disabled selection<Select disabled defaultValue="coffee" options={[{ value: "coffee", label: "Coffee" }]} /></label>
        <button type="submit">Submit</button>
        <button type="reset">Reset</button>
      </form>
      <output aria-label="Submitted category">{saved || "(empty)"}</output>
    </main>
  );
}

function ReceiptFixture() {
  const [print, setPrint] = useState(false);
  const closePrint = useCallback(() => setPrint(false), []);
  const query = new URLSearchParams(location.search);
  const sale: Sale = {
    id: "74a96ee5-921a-4cd6-86b1-ccff156a9931",
    created_at: "2026-11-02T09:18:00Z",
    total_cents: 38500,
    total_cost_cents: 14000,
    cost_note: "Owner ingredient record",
    cost_recorded_at: "2026-11-02T10:00:00Z",
    method: query.has("wallet") ? "gcash" : "cash",
    status: query.has("refunded")
      ? "refunded"
      : query.has("cancelled")
        ? "cancelled"
        : "completed",
    payment_status: query.has("refunded") ? "refunded" : "confirmed",
    tendered_cents: query.has("unknown-cash") ? null : 50000,
    refund_reason: query.has("refunded") ? "Wrong order returned" : null,
    items: [
      {
        name: query.has("long")
          ? "Spanish latte with oat milk, extra espresso and sugar-free vanilla syrup"
          : "Spanish latte · Oat milk",
        size_label: "16 oz",
        quantity: 2,
        unit_price_cents: 14500,
        line_total_cents: 29000,
      },
      {
        name: "Butter croissant",
        quantity: 1,
        unit_price_cents: 9500,
        line_total_cents: 9500,
      },
    ],
  };
  return (
    <NotificationProvider>
      <main className="workspace-content">
        <h1>Receipts</h1>
        <ReceiptDialog
          sale={sale}
          shopId="00000000-0000-4000-8000-000000000001"
          shopName="Common Ground Coffee"
          timezone="Asia/Manila"
          founder
          onPrint={() => setPrint(true)}
        />
        {print && (
          <ReceiptPrint
            sale={sale}
            shopName="Common Ground Coffee"
            timezone="Asia/Manila"
            onClose={closePrint}
          />
        )}
      </main>
    </NotificationProvider>
  );
}
function readFixtureExpenses(): Expense[] {
  if (new URLSearchParams(location.search).has("empty")) return [];
  const stored = sessionStorage.getItem("fixture-expenses");
  return stored ? JSON.parse(stored) : [{
    id: "00000000-0000-4000-8000-000000000003",
    spent_on: "2026-11-02", description: "Electricity", amount_cents: 2000,
    voided: new URLSearchParams(location.search).has("voided"),
  }];
}
function ReportFixture() {
  const customSales = sessionStorage.getItem("fixture-sales");
  const [loadError, setLoadError] = useState<string | undefined>(() => sessionStorage.getItem("fixture:report-error") ?? undefined);
  const [records, setRecords] = useState(readFixtureExpenses);
  const [search, setSearch] = useState(location.search);
  const fixtureRange = salesRange(
    Object.fromEntries(new URLSearchParams(search)), "2026-11-02",
  );
  useEffect(() => {
    const navigate = () => {
      setSearch(location.search);
      setLoadError(sessionStorage.getItem("fixture:report-error") ?? undefined);
    };
    window.addEventListener("fixture:navigate", navigate);
    window.addEventListener("popstate", navigate);
    return () => {
      window.removeEventListener("fixture:navigate", navigate);
      window.removeEventListener("popstate", navigate);
    };
  }, []);
  useEffect(() => {
    const refresh = () => setRecords(readFixtureExpenses());
    window.addEventListener("fixture:refresh", refresh);
    return () => window.removeEventListener("fixture:refresh", refresh);
  }, []);
  const expenses = records.filter(expense => expense.spent_on >= fixtureRange.from && expense.spent_on <= fixtureRange.to);
  const isExpenses = location.pathname === "/expenses" || new URLSearchParams(location.search).has("expenses");
  return (
    <NotificationProvider>
      <WorkspaceShell active={isExpenses ? "expenses" : "sales"} shopName="Common Ground Coffee">
        {isExpenses ? <ExpensesView
          loadError={loadError}
          expenses={expenses}
          shopId="00000000-0000-4000-8000-000000000001"
          founder={!location.search.includes("staff")}
          today="2026-11-02" from={fixtureRange.from} to={fixtureRange.to}
        /> : <SalesView
          loadError={loadError}
          shopId="00000000-0000-4000-8000-000000000001"
          shopName="Common Ground Coffee"
          founder={!location.search.includes("staff")}
          timezone="Asia/Manila"
          from={fixtureRange.from}
          to={fixtureRange.to}
          expenses={expenses}
          sales={(customSales ? JSON.parse(customSales) as Sale[] : location.search.includes("empty") ? [] : [
            {
              id: "00000000-0000-4000-8000-000000000002",
              created_at: "2026-11-02T04:00:00Z",
              total_cents: 14500,
              total_cost_cents: location.search.includes("missing")
                ? null
                : 5000,
              method: location.search.includes("wallet") ? "gcash" : "cash",
              status: location.search.includes("refunded")
                ? "refunded"
                : "completed",
              payment_status: "confirmed",
              tendered_cents: 20000,
              refund_reason: null,
              items: [
                {
                  name: "Latte",
                  quantity: 1,
                  unit_price_cents: 14500,
                  line_total_cents: 14500,
                },
              ],
            },
          ].flatMap((sale) =>
            Array.from(
              { length: location.search.includes("many") ? 40 : 1 },
              (_, index) => ({
                ...sale,
                id: index === 0
                  ? sale.id
                  : `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
              }),
            ),
          )).filter((sale) => {
            const date = shopDate("Asia/Manila", new Date(sale.created_at));
            return date >= fixtureRange.from && date <= fixtureRange.to;
          })}
        />}
      </WorkspaceShell>
    </NotificationProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <LoadingProvider><WorkspaceFrame>{
  (new URLSearchParams(location.search).has("landing") || ["/coffee-menu", "/visit"].includes(location.pathname)) ? <LandingFixture /> : (location.pathname === "/dashboard" || new URLSearchParams(location.search).has("dashboard")) ? <DashboardFixture /> : location.search.includes("loading") ? <LoadingFixture /> : location.search.includes("selects") ? (
    <SelectFixture />
  ) : location.search.includes("controls") ? (
    <ControlsFixture />
  ) : (location.search.includes("pos") || location.pathname === "/pos") ? (
    <NotificationProvider><PosWorkspace /></NotificationProvider>
  ) : (location.search.includes("menu") || location.pathname === "/menu") ? (
    <NotificationProvider><MenuWorkspace /></NotificationProvider>
  ) : (location.search.includes("libraries") || location.pathname === "/libraries") ? (
    <NotificationProvider><LibrariesWorkspace /></NotificationProvider>
  ) : location.search.includes("receipt") ? (
    <ReceiptFixture />
  ) : location.search.includes("sales") || location.search.includes("expenses") ||
    location.pathname === "/app/sales" || location.pathname === "/expenses" ? (
    <ReportFixture />
  ) : (
    <Fixture />
  )
  }</WorkspaceFrame></LoadingProvider>,
);
