"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Sale } from "@/lib/sales/domain";
import { SaleReceipt } from "./sale-receipt";

export function ReceiptPrint({
  sale,
  shopName,
  timezone,
  onClose,
}: {
  sale: Sale;
  shopName: string;
  timezone: string;
  onClose: () => void;
}) {
  useEffect(() => {
    window.addEventListener("afterprint", onClose);
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", onClose);
    };
  }, [onClose]);
  // A body-level portal lets print CSS remove the entire app, including modal overlays.
  return createPortal(
    <div className="print-receipt" aria-hidden="true">
      <SaleReceipt sale={sale} shopName={shopName} timezone={timezone} />
    </div>,
    document.body,
  );
}
