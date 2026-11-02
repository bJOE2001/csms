# Transaction review decisions

Reviewed with a built-in fresh-context reviewer under the doubt-driven-development skill; the user selected the built-in review and moving weighted average costing. Three review cycles were reconciled against the actual source; no external model was invoked.

Actionable findings addressed:

- Return saved idempotent results before checks that can expire after a successful commit.
- Serialize checkout/receiving/closure and membership changes; recheck access after the shop lock before new writes and device pairing.
- Use cumulative receipt valuation and allocate remaining inventory value on depletion, rather than independently rounding every partial receipt.
- Preserve unknown stock value, permit incoming receipts to reduce an audited negative recovery balance, and ledger full-count revaluations including unchanged quantity. Zero stock cannot have a positive count value.
- Bind each order to a server-issued menu snapshot. Offline-device pairing prevents an ordinary second browser from casually claiming the same designation.
- Require acknowledged sequence watermarks for normal closure, provide an explicit unresolved founder closure, and allow pending cash decisions on a closed unresolved shift before audited reconciliation review.
- Permit founder recovery of an original queued payload after authorization, stock, payment-method or discount-policy changes. Preserve its idempotency key/hash and audit any exceptional sequence allocation. Late recovery flags finalized reconciliation rather than silently altering it.
- Serialize reversal decisions, restrict cumulative whole-order refunds and stock returns, and charge cash refunds to the currently responsible shift.
- Separate revenue reversals from confirmed-funds refunds, and reconcile confirmations/refunds by their own event timestamps.
- Keep staff access to safe order/shift reads without ingredient cost, valuation, expenses, funding, or profit data.

Known operational bounds are documented in `OPERATIONS.md`: a server cannot prove the absence of unsynchronized records on a lost client; unexported browser data loss is unrecoverable; client clocks are not proof that an expired offline sale was authorized; founder recovery is explicit and audited; product COGS allocations and operating profit are labelled estimates. Auth email/Storage, hosted restore, and physical-device performance must be verified on the deployment environment.
