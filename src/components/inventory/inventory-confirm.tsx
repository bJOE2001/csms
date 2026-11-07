"use client";

import { useState } from "react";
import { AppConfirmDialog } from "../ui/app-confirm-dialog";
import { Button } from "../ui/button";
import { DialogBody, DialogFooter } from "../ui/dialog-layout";
import { notify } from "@/lib/notify";

export type ReviewRow = { label: string; value: string };

export function InventoryConfirm({
  title,
  description,
  summaryRows,
  confirmLabel = "Confirm",
  onClose,
  onConfirm,
}: {
  title: string;
  description?: string;
  summaryRows?: ReviewRow[];
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  return (
    <AppConfirmDialog open onClose={onClose} title={title} dismissible={!pending}>
      <DialogBody className="inventory-confirm-body">
        {description && <p className="hint">{description}</p>}
        {summaryRows && summaryRows.length > 0 && (
          <dl className="inventory-review-list" aria-label="Posting review summary">
            {summaryRows.map(row => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="hint">
          Confirmed changes are recorded permanently in Inventory History. Any later adjustment is recorded as a new entry.
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" data-dialog-cancel disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          pending={pending}
          pendingLabel="Posting…"
          onClick={async () => {
            if (pending) return;
            setPending(true);
            try {
              await onConfirm();
              onClose();
            } catch (error) {
              notify.error("Inventory operation failed", {
                id: "inventory-operation",
                description: error instanceof Error ? error.message : "Retry with the same details.",
              });
            } finally {
              setPending(false);
            }
          }}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </AppConfirmDialog>
  );
}
