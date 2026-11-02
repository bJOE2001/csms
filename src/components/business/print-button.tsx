"use client";
export function PrintButton({receiptId}:{receiptId:string}) {
  const print=()=>{
    const receipts=document.querySelectorAll<HTMLElement>("[data-receipt-id]");
    receipts.forEach(receipt=>{receipt.dataset.printSelected=String(receipt.dataset.receiptId===receiptId);});
    document.body.classList.add("printing-receipt");
    window.addEventListener("afterprint",()=>{document.body.classList.remove("printing-receipt");receipts.forEach(receipt=>delete receipt.dataset.printSelected);},{once:true});
    window.print();
  };
  return <button type="button" className="button secondary no-print" onClick={print}>Print receipt</button>;
}
