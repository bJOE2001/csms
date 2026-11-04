"use client";
import { saveMenu } from "@/lib/menu/use-catalog";
import { FormDialog } from "./ui/form-dialog";
import { MutationForm } from "./mutation-form";
import { Trash2 } from "lucide-react";

export function DeleteMenuRecord({
  id,
  name,
  kind,
  shopId,
  refresh,
  used = false,
}: {
  id: string;
  name: string;
  kind: "product" | "category";
  shopId: string;
  refresh: () => Promise<boolean>;
  used?: boolean;
}) {
  return (
    <FormDialog
      trigger={null}
      tableAction={{ icon: Trash2, tooltip: `Delete ${kind}`, variant: "destructive" }}
      triggerLabel={`Delete ${kind} ${name}`}
      title={`Delete ${name}?`}
      confirmation
      readOnly={used}
      danger
      description={
        kind === "product"
          ? "This product will be archived and removed from new orders. Historical receipts and profit records remain unchanged."
          : used
            ? "Products use this category. Reassign them before deleting the category."
            : "This unused category will be deleted."
      }
    >
      {used ? (
        <p className="hint">
          Edit each product to assign another category, then return here.
        </p>
      ) : (
        <MutationForm
          errorTitle={`Failed to delete ${kind}`}
          submitLabel={
            kind === "product" ? "Delete product" : "Delete category"
          }
          action={async () => {
            try {
              await saveMenu(
                kind === "product" ? "archive_product" : "delete_category",
                shopId,
                { id },
              );
              await refresh();
              return {
                status: "success",
                message:
                  kind === "product"
                    ? "Product archived."
                    : "Category deleted.",
              };
            } catch (error) {
              return {
                status: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "The record could not be deleted.",
              };
            }
          }}
        >
          <p className="hint">
            {kind === "product"
              ? "An item in an open cart will need to be removed before checkout."
              : "Sales history is unaffected."}
          </p>
        </MutationForm>
      )}
    </FormDialog>
  );
}
