"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";
import { Icon } from "./icon";
import { useFeedback } from "./feedback";
import { TableActionButton } from "./table-action-button";
import type { LucideIcon } from "lucide-react";

type FormDialogState = {
  cancel: () => void;
  complete: (message: string) => void;
  setPending: (pending: boolean) => void;
  danger: boolean;
  markDirty: () => void;
};
export const FormDialogContext = createContext<FormDialogState | null>(null);
export const useFormDialog = () => useContext(FormDialogContext);

export function FormDialog({
  trigger,
  title,
  description,
  children,
  triggerClassName = "secondary compact",
  triggerLabel,
  readOnly = false,
  confirmation = false,
  danger = false,
  id,
  initialOpen = false,
  className = "",
  readOnlyActions,
  tableAction,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
  readOnly?: boolean;
  confirmation?: boolean;
  danger?: boolean;
  id?: string;
  initialOpen?: boolean;
  className?: string;
  readOnlyActions?: ReactNode;
  tableAction?: {
    icon: LucideIcon;
    tooltip: string;
    variant?: "standard" | "destructive";
  };
}) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [pending, setPending] = useState(false);
  const keepEditing = useRef<HTMLButtonElement>(null),
    previousFocus = useRef<HTMLElement | null>(null);
  const openedInitially = useRef(false);
  useEffect(() => {
    if (
      (initialOpen || (id && window.location.hash === `#${id}`)) &&
      !openedInitially.current
    ) {
      openedInitially.current = true;
      setOpen(true);
    }
  }, [initialOpen, id]);
  const notify = useFeedback();
  const close = useCallback(() => {
    setOpen(false);
    setDirty(false);
    setDiscard(false);
  }, []);
  const requestClose = useCallback(() => {
    if (pending) return;
    if (discard) setDiscard(false);
    else if (dirty && !readOnly) {
      previousFocus.current = document.activeElement as HTMLElement;
      setDiscard(true);
    } else close();
  }, [pending, discard, dirty, readOnly, close]);
  useEffect(() => {
    if (discard) keepEditing.current?.focus();
    else if (previousFocus.current) {
      if (previousFocus.current.isConnected) previousFocus.current.focus();
      previousFocus.current = null;
    }
  }, [discard]);
  const complete = useCallback(
    (message: string) => {
      close();
      notify(message);
    },
    [close, notify],
  );
  const markDirty = useCallback(() => setDirty(true), []);
  const context = useMemo(
    () => ({ cancel: requestClose, complete, setPending, danger, markDirty }),
    [requestClose, complete, danger, markDirty],
  );
  const triggerProps = {
    id,
    "aria-haspopup": "dialog" as const,
    "aria-expanded": open,
    onClick: () => {
      setPending(false);
      setOpen(true);
    },
  };
  return (
    <>
      {tableAction ? (
        <TableActionButton {...triggerProps} {...tableAction} label={triggerLabel ?? title} />
      ) : (
        <Button {...triggerProps} className={triggerClassName} aria-label={triggerLabel}>
          {trigger}
        </Button>
      )}
      <Dialog
        open={open}
        onClose={requestClose}
        title={discard ? "Discard your changes?" : title}
        description={
          discard
            ? "Your unsaved changes will be lost. Keep editing to continue working on this record."
            : description
        }
        role={discard || confirmation ? "alertdialog" : "dialog"}
        dismissible={!pending}
        className={`crud-dialog ${className}`}
      >
        <div className="dialog-body">
          {discard && (
            <div>
              <p className="dialog-note">
                <Icon name="alert" size={20} />
                <span>This record has changes that have not been saved.</span>
              </p>
              <div className="dialog-actions">
                <Button
                  ref={keepEditing}
                  variant="outline"
                  onClick={() => setDiscard(false)}
                >
                  Keep editing
                </Button>
                <Button className="danger" onClick={close}>
                  Discard changes
                </Button>
              </div>
            </div>
          )}
          <div
            hidden={discard}
            // Field handlers run before dirty-state updates, preserving the first controlled edit.
            onInput={() => {
              if (!readOnly) setDirty(true);
            }}
            onChange={() => {
              if (!readOnly) setDirty(true);
            }}
          >
            {open && (
              <FormDialogContext.Provider value={context}>
                {children}
              </FormDialogContext.Provider>
            )}
          </div>
        </div>
        {readOnly && (
          <div className="dialog-actions dialog-readonly-actions">
            {readOnlyActions}
            <Button className="secondary" onClick={close}>
              Close
            </Button>
          </div>
        )}
      </Dialog>
    </>
  );
}
