import { SalesView } from "@/components/sales-view";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ReceiptDialog } from "@/components/receipt-dialog";
import { ReceiptPrint } from "@/components/receipt-print";
import { useCallback, useState } from "react";
import type { Sale } from "@/lib/sales/domain";
import { salesRange } from "@/lib/sales/period";
import { createRoot } from "react-dom/client";
import { MutationForm } from "@/components/mutation-form";
import { FormDialog } from "@/components/ui/form-dialog";
import { FeedbackProvider } from "@/components/ui/feedback";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import type { ActionState } from "@/lib/action-state";
import "@/app/tokens.css";
import "@/app/globals.css";
import "@/app/workspace.css";
import "@/app/workspace-shell.css";
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
  return (
    <FeedbackProvider>
      <main className="workspace-content">
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
          <DataTable
            caption="Products"
            columns={[
              { key: "name", label: "Product", sortable: true },
              { key: "price", label: "Price", sortable: true, numeric: true },
              { key: "actions", label: "Actions" },
            ]}
            rows={[
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
    </FeedbackProvider>
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
    <FeedbackProvider>
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
    </FeedbackProvider>
  );
}
const fixtureRange = salesRange(
  Object.fromEntries(new URLSearchParams(location.search)),
  "2026-11-02",
);
createRoot(document.getElementById("root")!).render(
  location.search.includes("receipt") ? (
    <ReceiptFixture />
  ) : location.search.includes("sales") ||
    location.pathname === "/app/sales" ? (
    <FeedbackProvider>
      <WorkspaceShell active="sales" shopName="Common Ground Coffee">
        <SalesView
          shopId="00000000-0000-4000-8000-000000000001"
          shopName="Common Ground Coffee"
          founder={!location.search.includes("staff")}
          timezone="Asia/Manila"
          from={fixtureRange.from}
          to={fixtureRange.to}
          period={fixtureRange.period}
          today="2026-11-02"
          expenses={[
            {
              id: "00000000-0000-4000-8000-000000000003",
              spent_on: "2026-11-02",
              description: "Electricity",
              amount_cents: 2000,
              voided: false,
            },
          ]}
          sales={[
            {
              id: "00000000-0000-4000-8000-000000000002",
              created_at: "2026-11-02T04:00:00Z",
              total_cents: 14500,
              total_cost_cents: location.search.includes("missing")
                ? null
                : 5000,
              method: "cash",
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
          ]}
        />
      </WorkspaceShell>
    </FeedbackProvider>
  ) : (
    <Fixture />
  ),
);
