"use client";
import { useState } from "react";
import { coffeeBrand } from "@/lib/brand";
import { money } from "@/lib/sales/domain";
import type { CustomerReceipt, ReceiptBusinessDetails } from "@/lib/sales/receipt";

function ReceiptHeader({ shopName, business }: { shopName: string; business: ReceiptBusinessDetails }) {
  const [failed, setFailed] = useState(false);
  const branch = shopName.trim() && ![coffeeBrand.name.toLowerCase(), "coffee logo"].includes(shopName.trim().toLowerCase()) ? shopName : undefined;
  return <header className="receipt-brand">
    {!failed && <>
      {/* Use the unchanged official artwork for both preview and printing. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={coffeeBrand.logo.src} alt={coffeeBrand.name} width={coffeeBrand.logo.width} height={coffeeBrand.logo.height} onError={() => setFailed(true)} className="receipt-logo" />
    </>}
    <p className="receipt-kind">Sales receipt</p>
    {(branch || business.address || business.phone) && <address className="receipt-store-details">
      {branch && <span>{branch}</span>}
      {business.address && <span>{business.address}</span>}
      {business.phone && <span>{business.phone}</span>}
    </address>}
  </header>;
}

/** Customer-facing receipt, shared by the dialog and printout. */
export function SaleReceipt({ receipt, shopName, business = { address: coffeeBrand.address } }: {
  receipt: CustomerReceipt; shopName: string; business?: ReceiptBusinessDetails;
}) {
  return <article className="receipt-paper" aria-label="Customer receipt">
    <ReceiptHeader shopName={shopName} business={business} />
    <div className="receipt-reference">
      <div><span className="receipt-label">Receipt no.</span><p className="font-mono font-semibold">#{receipt.number}</p></div>
      <span className={`receipt-status ${receipt.reversed ? "receipt-status-reversed" : ""}`}>{receipt.status}</span>
    </div>
    <dl className="receipt-date"><div><dt>Date</dt><dd><time dateTime={receipt.createdAt}>{receipt.date}</time></dd></div><div><dt>Time</dt><dd>{receipt.time}</dd></div></dl>
    <table className="receipt-items">
      <caption className="sr-only">Purchased items, quantities and amounts in PHP</caption>
      <thead><tr><th scope="col">Qty</th><th scope="col">Item</th><th scope="col">Amount</th></tr></thead>
      <tbody>{receipt.items.map((item, index) => <tr key={index}>
        <td>{item.quantity}</td><td><span className="receipt-item-name">{item.name}</span>
          {item.size && <span className="receipt-unit-price">Size: {item.size}</span>}
          <span className="receipt-unit-price">{money(item.unitPrice)} each</span>
        </td><td>{money(item.amount)}</td>
      </tr>)}</tbody>
    </table>
    {!receipt.items.length && <p className="receipt-empty">Item details were not recorded for this sale.</p>}
    <dl className="receipt-totals">
      {receipt.subtotal !== null && <div><dt>Item subtotal</dt><dd>{money(receipt.subtotal)}</dd></div>}
      {receipt.adjustment !== null && <div><dt>Recorded adjustment</dt><dd>{money(receipt.adjustment)}</dd></div>}
      <div className="receipt-grand-total"><dt>{receipt.reversed ? "Original total" : "Total"}</dt><dd>{money(receipt.total)}</dd></div>
      <div><dt>Payment method</dt><dd>{receipt.method}</dd></div>
      <div><dt>Payment status</dt><dd className="capitalize">{receipt.paymentStatus}</dd></div>
      {receipt.cash && <><div><dt>Cash received</dt><dd>{money(receipt.cash.received)}</dd></div><div><dt>Change given</dt><dd>{money(receipt.cash.change)}</dd></div></>}
      {receipt.refunded && <div className="receipt-refund-total"><dt>Refunded in full</dt><dd>{money(receipt.total)}</dd></div>}
      {receipt.refundedOn && <div><dt>Refund date</dt><dd>{receipt.refundedOn}</dd></div>}
    </dl>
    {receipt.reversed && <p className="receipt-reversal-note">{receipt.refunded ? "Fully refunded. Payment details refer to the original transaction." : "This historical sale was cancelled. The original total is shown for reference."}</p>}
    <footer className="receipt-footer">
      <p className="receipt-thanks">{receipt.reversed ? "Keep this receipt for your records." : "Thank you for your visit!"}</p>
      <p>{receipt.quantity} {receipt.quantity === 1 ? "item" : "items"}</p>
      <p className="receipt-full-reference">Transaction reference: {receipt.reference}</p>
    </footer>
  </article>;
}
