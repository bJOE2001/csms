"use client";
import { useId, useRef, useState } from "react";
import {
  productSchema,
  type Product,
  type ProductSize,
  type ShopData,
} from "@/lib/menu/domain";
import { cents } from "@/lib/sales/domain";
import { saveMenu } from "@/lib/menu/use-catalog";
import { FormDialog, useFormDialog } from "../ui/form-dialog";
import { MutationForm } from "../mutation-form";
import { Button } from "../ui/button";
import { Input } from "../ui/primitives/input";
import { Icon } from "../ui/icon";
import { ProductThumbnail } from "../pos/product-thumbnail";

type Props = {
  product?: Product;
  data: ShopData;
  refresh: () => Promise<boolean>;
};
type SizeDraft = Omit<
  ProductSize,
  "price_cents" | "cost_cents" | "is_default"
> & { price: string; cost: string };
const decimal = (value?: number | null) =>
  value == null ? "" : (value / 100).toFixed(2);
export function ProductDialog(props: Props) {
  return (
    <FormDialog
      trigger={
        props.product ? (
          <>
            <Icon name="edit" size={16} />
            Edit
          </>
        ) : (
          <>
            <Icon name="plus" size={18} />
            Add product
          </>
        )
      }
      triggerLabel={props.product ? `Edit ${props.product.name}` : undefined}
      triggerClassName={props.product ? "secondary compact" : ""}
      title={props.product ? "Edit product" : "Add product"}
      description="Menu changes apply to future sales. Completed receipts keep their original details."
      className="product-dialog"
    >
      <ProductEditor {...props} />
    </FormDialog>
  );
}
function ProductEditor({ product, data, refresh }: Props) {
  const id = useId();
  const draftId = useRef(product?.id ?? crypto.randomUUID());
  const dialog = useFormDialog();
  const [sizes, setSizes] = useState<SizeDraft[]>(
    (product?.sizes ?? []).map((size) => ({
      ...size,
      price: decimal(size.price_cents),
      cost: decimal(size.cost_cents),
    })),
  );
  const [defaultId, setDefaultId] = useState(
    product?.sizes?.find((size) => size.is_default)?.id,
  );
  const [image, setImage] = useState(product?.image_url ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sizeMessage, setSizeMessage] = useState("");
  const errorId = (key: string) => `${id}-${key}-error`;
  const errorProps = (key: string) => ({
    "aria-label": key.startsWith("sizes.")
      ? (
          {
            label: "Size label",
            price_cents: "Price (PHP)",
            cost_cents: "Cost (PHP)",
          } as Record<string, string>
        )[key.split(".").at(-1)!]
      : (
          {
            name: "Product name",
            description: "Description",
            image_url: "Product image URL",
            price_cents: "Selling price (PHP)",
            cost_cents: "Cost per item (PHP)",
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
  return (
    <MutationForm
      submitLabel="Save product"
      action={async (_previous, form) => {
        const invalid: Record<string, string> = {};
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
            cost_cents: amount(
              String(form.get(`size_cost_${sizeId}`)),
              `sizes.${index}.cost_cents`,
            ),
            active: form.get(`size_active_${sizeId}`) === "on",
            is_default: form.get("default_size") === sizeId,
          };
        });
        const mainSize = configured.find((size) => size.is_default);
        const parsed = productSchema.safeParse({
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
          cost_cents:
            mainSize?.cost_cents ??
            amount(String(form.get("cost")), "cost_cents"),
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
          };
        try {
          await saveMenu("product", data.shop.id, parsed.data);
          await refresh();
          return { status: "success", message: "Product saved." };
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
          <select
            name="category_id"
            aria-label="Category"
            defaultValue={product?.category_id ?? ""}
          >
            <option value="">Uncategorized</option>
            {data.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
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
      <div className="product-image-field">
        <ProductThumbnail name={product?.name ?? "Product"} imageUrl={image} />
        <label className="field">
          Product image URL
          <Input
            name="image_url"
            value={image}
            onChange={(event) => setImage(event.target.value)}
            placeholder="https://… or /images/…"
            maxLength={2048}
            {...errorProps("image_url")}
          />
          {errorText("image_url")}
          <small className="hint">
            Use your own hosted image. Leave blank for a neutral placeholder.
          </small>
        </label>
      </div>
      <section className="size-configuration" aria-label="Product sizes">
        <div className="size-heading">
          <div>
            <h3>Sizes & pricing</h3>
            <p className="hint">
              Use a regular price, or add custom sizes with their own prices and
              direct costs.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={sizes.length >= 20}
            onClick={() => {
              const newId = crypto.randomUUID();
              setSizes((current) => [
                ...current,
                { id: newId, label: "", price: "", cost: "", active: true },
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
            <label className="field">
              Cost per item (PHP)
              <Input
                name="cost"
                required
                inputMode="decimal"
                defaultValue={decimal(product?.cost_cents)}
                {...errorProps("cost_cents")}
              />
              {errorText("cost_cents")}
            </label>
          </div>
        )}
        {sizes.map((size, index) => (
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
            <label className="field">
              Cost (PHP)
              <Input
                required
                inputMode="decimal"
                name={`size_cost_${size.id}`}
                value={size.cost}
                onChange={(event) =>
                  changeSize(index, { cost: event.target.value })
                }
                {...errorProps(`sizes.${index}.cost_cents`)}
              />
              {errorText(`sizes.${index}.cost_cents`)}
            </label>
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
                Available
              </label>
              <Button
                variant="ghost"
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
        ))}
        {sizeMessage && (
          <p className="hint" role="status">
            {sizeMessage}
          </p>
        )}
        <p className="hint">
          Direct cost includes ingredients and packaging for one item. Enter 0
          only when there is no cost. Maximum 20 sizes.
        </p>
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
