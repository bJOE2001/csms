import { money, type Sale } from "@/lib/sales/domain";
import { Icon } from "./ui/icon";

function paymentMethod(method: string) {
  if (method === "gcash") return "GCash";
  if (method === "cash") return "Cash";
  return method === "unknown" ? "Not recorded" : method;
}

/** Customer-facing receipt, shared by the dialog and printout. */
export function SaleReceipt({
  sale,
  shopName,
  timezone,
}: {
  sale: Sale;
  shopName: string;
  timezone: string;
}) {
  const reversed = sale.status === "refunded" || sale.status === "cancelled";
  const cashRecorded =
    sale.method === "cash" &&
    sale.tendered_cents !== null &&
    sale.tendered_cents >= sale.total_cents;
  const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
  const timestamp = new Date(sale.created_at);
  const status =
    sale.status === "completed"
      ? "Completed"
      : sale.status === "refunded"
        ? "Refunded"
        : sale.status === "cancelled"
          ? "Cancelled"
          : sale.status;
  const paymentStatus =
    sale.payment_status === "confirmed"
      ? "Confirmed"
      : sale.payment_status === "refunded"
        ? "Refunded"
        : sale.payment_status === "unknown"
          ? "Not recorded"
          : sale.payment_status;
  return (
    <article className="receipt-paper" aria-label="Customer receipt">
      <header className="receipt-brand">
        <span className="receipt-mark">
          <Icon name="coffee" size={28} />
        </span>
        <h2>{shopName}</h2>
        <p>Sales receipt</p>
      </header>
      <div className="receipt-reference">
        <div>
          <span className="receipt-label">Receipt no.</span>
          <p className="font-mono font-semibold">
            #{sale.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <span
          className={`receipt-status ${reversed ? "receipt-status-reversed" : ""}`}
        >
          {status}
        </span>
      </div>
      <time className="receipt-date" dateTime={sale.created_at}>
        {new Intl.DateTimeFormat("en-PH", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: timezone,
        }).format(timestamp)}
      </time>
      <table className="receipt-items">
        <caption className="sr-only">
          Purchased items, quantities and amounts in PHP
        </caption>
        <thead>
          <tr>
            <th scope="col">Qty</th>
            <th scope="col">Item</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, index) => (
            <tr key={index}>
              <td>{item.quantity}</td>
              <td>
                <span className="receipt-item-name">{item.name}</span>
                {item.size_label && (
                  <span className="receipt-unit-price">
                    Size: {item.size_label}
                  </span>
                )}
                <span className="receipt-unit-price">
                  {money(item.unit_price_cents)} each
                </span>
              </td>
              <td>{money(item.line_total_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!sale.items.length && (
        <p className="receipt-empty">
          Item details were not recorded for this sale.
        </p>
      )}
      <dl className="receipt-totals">
        <div className="receipt-grand-total">
          <dt>{reversed ? "Original total" : "Total"}</dt>
          <dd>{money(sale.total_cents)}</dd>
        </div>
        <div>
          <dt>Payment method</dt>
          <dd>{paymentMethod(sale.method)}</dd>
        </div>
        <div>
          <dt>Payment status</dt>
          <dd className="capitalize">{paymentStatus}</dd>
        </div>
        {cashRecorded && (
          <>
            <div>
              <dt>Cash received</dt>
              <dd>{money(sale.tendered_cents!)}</dd>
            </div>
            <div>
              <dt>Change given</dt>
              <dd>{money(sale.tendered_cents! - sale.total_cents)}</dd>
            </div>
          </>
        )}
        {sale.status === "refunded" && (
          <div className="receipt-refund-total">
            <dt>Refunded in full</dt>
            <dd>{money(sale.total_cents)}</dd>
          </div>
        )}
      </dl>
      {reversed && (
        <p className="receipt-reversal-note">
          {sale.status === "refunded"
            ? "Fully refunded. Cash received and change refer to the original payment."
            : "This sale was cancelled. The original total is shown for reference."}
        </p>
      )}
      <footer className="receipt-footer">
        <p className="receipt-thanks">
          {reversed
            ? "Keep this receipt for your records."
            : "Thank you for your visit."}
        </p>
        <p>
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </p>
        <p className="receipt-full-reference">Reference: {sale.id}</p>
      </footer>
    </article>
  );
}
