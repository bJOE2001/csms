"use client";
import { useRef } from "react";
import type { Category } from "@/lib/menu/domain";
import { saveMenu } from "@/lib/menu/use-catalog";
import { FormDialog } from "../ui/form-dialog";
import { MutationForm } from "../mutation-form";
import { Input } from "../ui/primitives/input";
import { Icon } from "../ui/icon";

type Props = {
  category?: Category;
  shopId: string;
  refresh: () => Promise<boolean>;
};
export function CategoryDialog({ category, shopId, refresh }: Props) {
  const draft = useRef<string | undefined>(undefined);
  return (
    <FormDialog
      trigger={
        category ? (
          "Edit"
        ) : (
          <>
            <Icon name="plus" size={16} />
            Add category
          </>
        )
      }
      triggerLabel={category ? `Edit category ${category.name}` : undefined}
      title={category ? "Edit category" : "Add category"}
    >
      <MutationForm
        submitLabel="Save category"
        action={async (_previous, form) => {
          try {
            await saveMenu("category", shopId, {
              id: category?.id ?? (draft.current ??= crypto.randomUUID()),
              name: String(form.get("name")),
            });
            draft.current = undefined;
            await refresh();
            return { status: "success", message: "Category saved." };
          } catch (error) {
            return {
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Category could not be saved.",
            };
          }
        }}
      >
        <label className="field">
          Category name
          <Input
            name="name"
            required
            maxLength={60}
            defaultValue={category?.name}
          />
        </label>
      </MutationForm>
    </FormDialog>
  );
}
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
      trigger={
        <>
          <Icon name="delete" size={16} />
          Delete
        </>
      }
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
