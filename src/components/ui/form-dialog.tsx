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
  type Ref,
  type RefObject,
} from "react";
import { AppFormDialog } from "./app-form-dialog";
import { AppConfirmDialog } from "./app-confirm-dialog";
import { DialogBody } from "./dialog-layout";
import type { DialogSize } from "./dialog";
import { Button } from "./button";
import { Icon } from "./icon";
import { TableActionButton } from "./table-action-button";
import type { LucideIcon } from "lucide-react";

type FormDialogState = {
  cancel: () => void;
  complete: () => void;
  setPending: (pending: boolean) => void;
  danger: boolean;
  markDirty: () => void;
  closeThen: (action: () => void) => void;
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
  size = "md",
  readOnlyActions,
  tableAction,
  hideTrigger = false,
  onClose,
  triggerRef,
  returnFocusRef,
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
  size?: DialogSize;
  readOnlyActions?: ReactNode;
  onClose?: () => void;
  triggerRef?: Ref<HTMLButtonElement>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  hideTrigger?: boolean;
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
  const openedInitially = useRef(false);
  const afterClose = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (
      (initialOpen || (id && window.location.hash === `#${id}`)) &&
      !openedInitially.current
    ) {
      openedInitially.current = true;
      setOpen(true);
    }
  }, [initialOpen, id]);
  const close = useCallback(() => {
    setOpen(false);
    setDirty(false);
    setDiscard(false);
    onClose?.();
    const action = afterClose.current;
    afterClose.current = undefined;
    action?.();
  }, [onClose]);
  const requestClose = useCallback(() => {
    if (pending) return;
    if (discard) setDiscard(false);
    else if (dirty && !readOnly) {
      setDiscard(true);
    } else close();
  }, [pending, discard, dirty, readOnly, close]);
  const complete = close;
  const markDirty = useCallback(() => setDirty(true), []);
  const closeThen = useCallback((action: () => void) => {
    if (pending) return;
    afterClose.current = action;
    requestClose();
  }, [pending, requestClose]);
  const context = useMemo(
    () => ({ cancel: requestClose, complete, setPending, danger, markDirty, closeThen }),
    [requestClose, complete, danger, markDirty, closeThen],
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
  const Presentation = confirmation ? AppConfirmDialog : AppFormDialog;
  return (
    <>
      {!hideTrigger && (tableAction ? (
        <TableActionButton ref={triggerRef} {...triggerProps} {...tableAction} label={triggerLabel ?? title} />
      ) : (
        <Button ref={triggerRef} {...triggerProps} className={triggerClassName} aria-label={triggerLabel}>
          {trigger}
        </Button>
      ))}
      <Presentation
        open={open}
        onClose={requestClose}
        title={title}
        description={description}
        size={confirmation ? "sm" : size}
        dismissible={!pending}
        className={`crud-dialog ${className}`}
        returnFocusRef={returnFocusRef}
        footer={readOnly ? <>
          {readOnlyActions}
          <Button className="secondary" data-dialog-cancel onClick={close}>Close</Button>
        </> : undefined}
      >
        <div
          className="dialog-content"
          // Field handlers run before dirty-state updates, preserving the first controlled edit.
          onInput={() => { if (!readOnly) setDirty(true); }}
          onChange={() => { if (!readOnly) setDirty(true); }}
        >
          {open && <FormDialogContext.Provider value={context}>
            {readOnly ? <DialogBody>{children}</DialogBody> : children}
          </FormDialogContext.Provider>}
        </div>
      </Presentation>
      <AppConfirmDialog
        open={open && discard}
        onClose={() => { afterClose.current = undefined; setDiscard(false); }}
        title="Discard your changes?"
        description="Your unsaved changes will be lost. Keep editing to continue working on this record."
        footer={<>
          <Button variant="outline" data-dialog-cancel onClick={() => { afterClose.current = undefined; setDiscard(false); }}>Keep editing</Button>
          <Button className="danger" onClick={close}>Discard changes</Button>
        </>}
      >
        <DialogBody>
          <p className="dialog-note">
            <Icon name="alert" size={20} />
            <span>This record has changes that have not been saved.</span>
          </p>
        </DialogBody>
      </AppConfirmDialog>
    </>
  );
}
