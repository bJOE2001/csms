"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { notify } from "@/lib/notify";
import type { CustomerReceipt, ReceiptBusinessDetails, ReceiptPaperWidth } from "@/lib/sales/receipt";
import { SaleReceipt } from "./sale-receipt";

export function ReceiptPrint({ receipt, shopName, business, paperWidth = "80", onClose }: {
  receipt: CustomerReceipt; shopName: string; business?: ReceiptBusinessDetails; paperWidth?: ReceiptPaperWidth; onClose: () => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true, frame = 0;
    window.addEventListener("afterprint", onClose);
    async function prepare() {
      try {
        await document.fonts.ready;
        await Promise.all([...content.current!.querySelectorAll("img")].map(image => image.decode().catch(() => undefined)));
        // Let the logo's error fallback and final font metrics commit before invoking native print.
        await new Promise<void>(resolve => { frame = requestAnimationFrame(() => resolve()); });
        if (active) window.print();
      } catch {
        if (active) {
          notify.error("Receipt could not be prepared", { description: "Please try printing again." });
          onClose();
        }
      }
    }
    void prepare();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", onClose);
    };
  }, [onClose]);
  // A body-level portal lets print CSS remove the entire app, including modal overlays.
  return createPortal(<div ref={content} className="print-receipt" data-paper-width={paperWidth} aria-hidden="true">
    <SaleReceipt receipt={receipt} shopName={shopName} business={business} />
  </div>, document.body);
}
