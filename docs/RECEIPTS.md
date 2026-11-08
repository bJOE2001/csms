# Branded customer receipts

`SaleReceipt` is the shared customer preview and print composition. `customerReceipt` projects an explicit allowlist of transaction-time item names, sizes, quantities, prices, totals, payment details and identifiers. It excludes preparation costs, owner notes and internal refund reasons. ReceiptDialog keeps those business details in an owner-only section outside the printable model. Existing refund authorization, reason validation, duplicate-refund protection and transaction persistence remain unchanged.

## Branding and business information

`src/lib/brand.ts` centralizes Sip & Snap’s approved identity, the original `/images/Logo.png` artwork, its 1254 × 1254 aspect ratio, and the owner-confirmed address. The sidebar, sign-in page, public defaults and receipts use that same source. Artwork is not recolored, cropped or regenerated. Receipt previews show the official color artwork; failed previews fall back to the business name. Thermal receipts use the business name as a clean monochrome fallback and contain no color-logo bitmap.

Sales passes the existing verified `SITE_ADDRESS` and optional validated `SITE_CONTACT_PHONE` configuration through to both preview and print. Missing optional details are omitted; no phone number is fabricated. A distinct shop name can appear as a branch label; the old Coffee Logo placeholder is omitted.

## Historical and payment information

Cash and E-wallet are the display names. The legacy `gcash` wire/storage value remains unchanged. Only recorded cash tender and change appear; E-wallet receipts never show cash fields. The receipt number and full transaction reference remain derived from the original stored sale ID. No external wallet reference is invented because the current receipt records do not store one.

The final total always comes from the saved transaction. Item subtotal uses saved line amounts. Older records whose item sum differs from their final total show a neutral Recorded adjustment; the system does not invent a tax, service charge or explicit discount type. Refunded receipts retain the original total and clearly show Refunded in full plus the stored refund date when available. Legacy cancelled receipts remain readable without adding a cancellation action.

## Printing

Choose 80 mm (default) or 58 mm in the receipt footer. The print stylesheet uses 72 mm or 50 mm of content with 4 mm page margins. Select matching paper in the printer dialog, disable browser headers/footers, and check the printer’s actual printable area. No fixed receipt length is imposed; long receipts paginate with repeating item headers and unbroken normal item rows.

`ReceiptPrint` mounts only the customer-safe model in a body-level portal. It waits for fonts and image decoding, permits the logo fallback to render, then calls the existing native browser print function. Print CSS excludes the entire application, overlays, owner details, notifications and controls. Closing the receipt during preparation cancels the pending print; preparation errors allow a retry. The afterprint event removes the temporary portal without claiming that a physical print succeeded.

Browser printing still opens its print dialog and depends on the operating system and printer configuration. Silent printing and physical thermal-printer compatibility are not claimed. Reference behavior: [native print](https://developer.mozilla.org/en-US/docs/Web/API/Window/print), [image readiness](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode), [page sizing](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@page/size).

## Validation

Receipt tests cover Cash, E-wallet, unknown tender, historical sizes/names, adjustments, refunds, optional details, owner-only business information, image failure/delay, cancellation of print preparation, native print failure, dialog focus and short/long 58/80 mm print output. Browser-generated PDFs and screenshots are in `.local/ui-review/receipts/`. Physical paper output requires testing with the owner’s printer.

The final focused run passed all 23 receipt/sign-in browser tests. The 58 mm and 80 mm short samples each fit one 210 mm PDF page; long samples paginate. Screenshots and rasterized PDF output were inspected. PDF capture resets document scrolling after element screenshots so the print header is captured from the document origin. The production build, TypeScript and ESLint checks also passed.
