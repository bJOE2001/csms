"use client";
import { useId, useRef, useState } from "react";
import { BookOpenCheck, Pencil } from "lucide-react";
import {
  productWriteSchema,
  productInventoryStatus,
  type Product,
  type ProductSize,
  type ShopData,
} from "@/lib/menu/domain";
import { RecipeDialog } from "../inventory/recipe-dialog";
import { cents, money } from "@/lib/sales/domain";
import { saveMenu } from "@/lib/menu/use-catalog";
import { FormDialog, useFormDialog } from "../ui/form-dialog";
import { MutationForm } from "../mutation-form";
import { Button } from "../ui/button";
import { TableActionButton } from "../ui/table-action-button";
import { Input } from "../ui/primitives/input";
import { Select } from "../ui/select";
import { Icon } from "../ui/icon";
import { ProductImageUpload } from "./product-image-upload";
import { productImageFileError } from "@/lib/menu/image-upload";
import { RecipeStatus } from "./recipe-status";
import { useCan } from "../access-context";

type Props = {
  product?: Product;
  data: ShopData;
  refresh: () => Promise<boolean>;
};
type SizeDraft = Omit<
  ProductSize,
  "price_cents" | "cost_cents" | "is_default"
> & { price: string };

const decimal = (value?: number | null) =>
  value == null ? "" : (value / 100).toFixed(2);

function RecipeSummary({ product, sizeId, onManage }: {
  product?: Product;
  sizeId: string;
  onManage: () => void;
}) {
  const entry = product?.inventory?.[sizeId];
  const canRecipe = useCan("inventory", "recipe", true);
  const hasCost = entry?.state === "active" && entry.cost_cents != null;
  const status = product ? productInventoryStatus({ ...product, inventory: entry ? { [sizeId]: entry } : {} }) : "Recipe Not Configured";
  return (
    <div className="product-recipe-summary">
      <span className="product-recipe-label">Calculated Preparation Cost</span>
      <div className="product-recipe-content">
        <div className={`product-recipe-value${hasCost ? "" : " product-recipe-value-unavailable"}`}>
          <output aria-label="Calculated Preparation Cost">
            {hasCost ? money(entry.cost_cents!) : "Cost unavailable"}
          </output>
          <RecipeStatus status={status} />
        </div>
        {canRecipe && (product ? (
          <TableActionButton icon={BookOpenCheck} label="View Recipe" tooltip="View Recipe" onClick={onManage} />
        ) : (
          <small className="product-recipe-hint">Use Save &amp; Configure Recipe below to set ingredients.</small>
        ))}
      </div>
    </div>
  );
}

export function ProductDialog(props: Props) {
  const [recipeTarget, setRecipeTarget] = useState<{ sizeId: string; product: Product }>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const recipeProduct = recipeTarget
    ? (props.data.products.find((p) => p.id === recipeTarget.product.id) ?? props.product ?? recipeTarget.product)
    : undefined;
  return (
    <>
      <FormDialog
        triggerRef={triggerRef}
        trigger={props.product ? null : <><Icon name="plus" size={18} />Add product</>}
        triggerLabel={props.product ? `Edit ${props.product.name}` : undefined}
        tableAction={props.product ? { icon: Pencil, tooltip: "Edit product" } : undefined}
        triggerClassName={props.product ? "secondary compact" : "accent"}
        title={props.product ? "Edit product" : "Add product"}
        className="product-dialog"
        size="lg"
      >
        <ProductEditor
          {...props}
          onManageRecipe={(sizeId, targetProduct) => setRecipeTarget({ sizeId, product: targetProduct })}
        />
      </FormDialog>
      {recipeProduct && recipeTarget && (
        <RecipeDialog
          product={recipeProduct}
          refresh={props.refresh}
          initialSizeId={recipeTarget.sizeId}
          initialOpen
          hideTrigger
          returnFocusRef={triggerRef}
          onClose={() => setRecipeTarget(undefined)}
        />
      )}
    </>
  );
}

function ProductEditor({ product, data, refresh, onManageRecipe }: Props & {
  onManageRecipe: (sizeId: string, product: Product) => void;
}) {
  const canRecipe = useCan("inventory", "recipe", data.founder);
  const id = useId();
  const draftId = useRef(product?.id ?? crypto.randomUUID());
  const savedProductRef = useRef<{ product: Product; sizeId: string } | null>(null);
  const dialog = useFormDialog();
  const [sizes, setSizes] = useState<SizeDraft[]>(
    (product?.sizes ?? []).map((size) => ({
      ...size,
      price: decimal(size.price_cents),
    })),
  );
  const [defaultId, setDefaultId] = useState(
    product?.sizes?.find((size) => size.is_default)?.id,
  );
  const [image, setImage] = useState(product?.image_url ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sizeMessage, setSizeMessage] = useState("");
  const errorId = (key: string) => `${id}-${key}-error`;
  const errorProps = (key: string) => ({
    "aria-label": key.startsWith("sizes.")
      ? (
          {
            label: "Size label",
            price_cents: "Price (PHP)",
          } as Record<string, string>
        )[key.split(".").at(-1)!]
      : (
          {
            name: "Product name",
            description: "Description",
            image_url: "Product image URL",
            price_cents: "Selling price (PHP)",
          } as Record<string, string>
        )[key],
    "aria-invalid": !!errors[key] || undefined,
    "aria-describedby": errors[key] ? errorId(key) : undefined,
  });
  const errorText = (key: string) =>
    errors[key] && (
      <span id={errorId(key)} className="form-field-error">
        {errors[key]}
      </span>
    );
  const changeSize = (index: number, patch: Partial<SizeDraft>) =>
    setSizes((current) =>
      current.map((size, i) => (i === index ? { ...size, ...patch } : size)),
    );

  const regularActive = product?.inventory?.regular?.state === "active";
  const manageRecipe = (sizeId: string) => {
    if (product) dialog?.closeThen(() => onManageRecipe(sizeId, product));
  };

  return (
    <MutationForm
      submitLabel="Save product"
      secondarySubmit={!product && canRecipe ? { label: "Save & Configure Recipe", name: "intent", value: "configure_recipe" } : undefined}
      onSuccess={(form) => {
        if (form.get("intent") === "configure_recipe" && savedProductRef.current) {
          onManageRecipe(savedProductRef.current.sizeId, savedProductRef.current.product);
        }
      }}
      successTitle={product ? "Product updated" : "Product saved successfully"}
      errorTitle="Failed to save product"
      action={async (_previous, form) => {
        const invalid: Record<string, string> = {};
        if (imageFile) {
          const imageError = productImageFileError(imageFile);
          if (imageError) invalid.image_file = imageError;
        }
        const amount = (value: string, key: string) => {
          try {
            return cents(value);
          } catch (error) {
            invalid[key] = (error as Error).message;
            return NaN;
          }
        };
        const configured = form.getAll("size_id").map((value, index) => {
          const sizeId = String(value);
          return {
            id: sizeId,
            label: String(form.get(`size_label_${sizeId}`)),
            price_cents: amount(
              String(form.get(`size_price_${sizeId}`)),
              `sizes.${index}.price_cents`,
            ),
            active: form.get(`size_active_${sizeId}`) === "on",
            is_default: form.get("default_size") === sizeId,
          };
        });
        const mainSize = configured.find((size) => size.is_default);
        const parsed = productWriteSchema.safeParse({
          id: draftId.current,
          name: String(form.get("name")),
          category_id: form.get("category_id") || null,
          description: String(form.get("description")),
          image_url: String(form.get("image_url")).trim() || null,
          active: form.get("active") === "on",
          sizes: configured,
          price_cents:
            mainSize?.price_cents ??
            amount(String(form.get("price")), "price_cents"),

        });
        if (!parsed.success)
          for (const issue of parsed.error.issues) {
            const key = issue.path.join(".");
            invalid[key] ??= issue.message;
          }
        setErrors(invalid);
        if (!parsed.success || Object.keys(invalid).length)
          return {
            status: "error",
            message: "Check the highlighted product and size fields.",
            validation: true,
          };
        try {
          await saveMenu(
            "product",
            data.shop.id,
            parsed.data,
            imageFile ?? undefined,
          );
          savedProductRef.current = {
            product: {
              id: draftId.current,
              name: parsed.data.name,
              category_id: parsed.data.category_id,
              description: parsed.data.description,
              image_url: parsed.data.image_url,
              active: parsed.data.active,
              price_cents: parsed.data.price_cents,
              sizes: (parsed.data.sizes ?? []).map((size) => ({ ...size, cost_cents: null })),
            },
            sizeId: mainSize?.id ?? parsed.data.sizes?.[0]?.id ?? "regular",
          };
          await refresh();
          return {
            status: "success",
            message: imageFile
              ? "Product saved and image uploaded."
              : "Product saved.",
          };
        } catch (error) {
          return {
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Product could not be saved.",
          };
        }
      }}
    >
      <div className="product-form-grid">
        <label className="field">
          Product name
          <Input
            name="name"
            required
            maxLength={120}
            defaultValue={product?.name}
            {...errorProps("name")}
          />
          {errorText("name")}
        </label>
        <label className="field">
          Category
          <Select
            name="category_id"
            aria-label="Category"
            defaultValue={product?.category_id ?? ""}
            options={[
              { value: "", label: "Uncategorized" },
              ...data.categories.map((category) => ({
                value: category.id,
                label: category.name,
              })),
            ]}
          />
        </label>
      </div>
      <label className="field">
        Description
        <textarea
          name="description"
          maxLength={1000}
          rows={2}
          defaultValue={product?.description}
          {...errorProps("description")}
        />
        {errorText("description")}
      </label>
      <ProductImageUpload
        value={image}
        file={imageFile}
        error={errors.image_url}
        onChange={(url, file) => {
          setImage(url);
          setImageFile(file);
          setErrors((current) => ({
            ...current,
            image_url: "",
            image_file: "",
          }));
        }}
      />
      <section className="size-configuration" aria-label="Product sizes">
        <div className="size-heading">
          <div>
            <h3>Sizes & pricing</h3>
          </div>
          <Button
            variant="outline"
            disabled={sizes.length >= 20 || regularActive}
            onClick={() => {
              const newId = crypto.randomUUID();
              setSizes((current) => [
                ...current,
                { id: newId, label: "", price: "", active: true },
              ]);
              if (!sizes.length) setDefaultId(newId);
              setSizeMessage("");
              dialog?.markDirty();
            }}
          >
            <Icon name="plus" size={16} />
            Add size
          </Button>
        </div>
        {errorText("sizes")}
        {!sizes.length && (
          <>
            <div className="product-form-grid">
              <label className="field">
                Selling price (PHP)
                <Input
                  name="price"
                  required
                  inputMode="decimal"
                  defaultValue={decimal(product?.price_cents)}
                  {...errorProps("price_cents")}
                />
                {errorText("price_cents")}
              </label>
              <RecipeSummary product={product} sizeId="regular" onManage={() => manageRecipe("regular")} />
            </div>
          </>
        )}
        {sizes.map((size, index) => {
          const sizeActive = product?.inventory?.[size.id]?.state === "active";
          return (
            <fieldset key={size.id} className="size-editor-row">
              <legend>Size {index + 1}</legend>
              <input type="hidden" name="size_id" value={size.id} />
              <label className="field">
                Size label
                <Input
                  required
                  maxLength={60}
                  name={`size_label_${size.id}`}
                  value={size.label}
                  onChange={(event) =>
                    changeSize(index, { label: event.target.value })
                  }
                  {...errorProps(`sizes.${index}.label`)}
                />
                {errorText(`sizes.${index}.label`)}
              </label>
              <label className="field">
                Price (PHP)
                <Input
                  required
                  inputMode="decimal"
                  name={`size_price_${size.id}`}
                  value={size.price}
                  onChange={(event) =>
                    changeSize(index, { price: event.target.value })
                  }
                  {...errorProps(`sizes.${index}.price_cents`)}
                />
                {errorText(`sizes.${index}.price_cents`)}
              </label>
              <RecipeSummary product={product?.sizes?.some(saved => saved.id === size.id) ? product : undefined} sizeId={size.id} onManage={() => manageRecipe(size.id)} />
              <div className="size-options">
                <label>
                  <input
                    type="radio"
                    name="default_size"
                    value={size.id}
                    checked={defaultId === size.id}
                    onChange={() => setDefaultId(size.id)}
                  />
                  Default
                </label>
                <label>
                  <input
                    type="checkbox"
                    name={`size_active_${size.id}`}
                    checked={size.active}
                    onChange={(event) =>
                      changeSize(index, { active: event.target.checked })
                    }
                  />
                  Size available
                </label>
                <Button
                  variant="ghost"
                  disabled={sizeActive}
                  aria-label={`Remove size ${size.label || index + 1}`}
                  onClick={() => {
                    const remaining = sizes.filter((item) => item.id !== size.id);
                    setSizes(remaining);
                    if (defaultId === size.id) setDefaultId(remaining[0]?.id);
                    setSizeMessage(
                      "Size removed from this draft. Save to apply; past receipts remain unchanged.",
                    );
                    dialog?.markDirty();
                  }}
                >
                  <Icon name="delete" size={16} />
                  Remove
                </Button>
              </div>
            </fieldset>
          );
        })}
        {sizeMessage && (
          <p className="hint" role="status">
            {sizeMessage}
          </p>
        )}
      </section>
      <label className="menu-checkbox">
        <input
          type="checkbox"
          name="active"
          defaultChecked={product?.active ?? true}
        />
        Available for sale
      </label>
    </MutationForm>
  );
}
