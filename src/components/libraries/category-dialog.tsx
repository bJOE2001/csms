"use client";
import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import type { Category } from "@/lib/menu/domain";
import { saveMenu } from "@/lib/menu/use-catalog";
import { FormDialog } from "../ui/form-dialog";
import { MutationForm } from "../mutation-form";
import { Input } from "../ui/primitives/input";

type Props = {
  category?: Category;
  shopId: string;
  refresh: () => Promise<boolean>;
};
export function CategoryDialog({ category, shopId, refresh }: Props) {
  return (
    <FormDialog
      size="sm"
      trigger={
        category ? (
          null
        ) : (
          <>
            Add category
          </>
        )
      }
      triggerLabel={category ? `Edit category ${category.name}` : undefined}
      tableAction={category ? { icon: Pencil, tooltip: "Edit category" } : undefined}
      triggerClassName={category ? "secondary compact" : "accent"}
      title={category ? "Edit category" : "Add category"}
    >
      <CategoryEditor category={category} shopId={shopId} refresh={refresh} />
    </FormDialog>
  );
}

function CategoryEditor({ category, shopId, refresh }: Props) {
  const draft = useRef<string | undefined>(undefined);
  const [name, setName] = useState(category?.name ?? "");
  return (
    <MutationForm
      submitLabel="Save category"
      successTitle={category ? "Category updated" : "Category created"}
      errorTitle="Failed to save category"
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
          value={name}
          onChange={event => setName(event.target.value)}
        />
      </label>
    </MutationForm>
  );
}
