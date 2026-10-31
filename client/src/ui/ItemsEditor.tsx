import { useEffect, useState } from "react";
import { asApiError, formatMoney, list, request, type ApiError } from "../lib/api.js";
import type { Product, ProductVariant, ProductWithVariants } from "../lib/types.js";
import { Badge, Button, Select, TextInput } from "./components.js";

export interface ItemRow {
  productId: number | null;
  variantId: number | null;
  quantity: string;
  taxId: number | null;
}

/**
 * Line-item editor used by quotation templates and subscription forms.
 * Unit prices are NEVER accepted here — the server derives them from the
 * catalogue (or the template's stored agreed price) so totals stay trusted.
 */
export function ItemsEditor({
  rows,
  onRowsChange,
  taxes,
}: {
  rows: ItemRow[];
  onRowsChange: (rows: ItemRow[]) => void;
  taxes: Array<{ id: number; name: string; taxMode: string }>;
}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  // Variants arrive per product via the detail endpoint; cached by product id.
  const [variantMap, setVariantMap] = useState<Map<number, ProductVariant[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ page: "1", pageSize: "100" });
        const response = await list<Product>(`/products?${params.toString()}`);
        if (!cancelled) {
          setProducts(response.data);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(asApiError(caught));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function loadVariants(productId: number): Promise<ProductVariant[]> {
    const cached = variantMap.get(productId);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    return request<ProductWithVariants>(`/products/${productId}`).then((detail) => {
      const variants = detail.variants ?? [];
      setVariantMap((current) => new Map(current).set(productId, variants));
      return variants;
    });
  }

  function updateRow(index: number, patch: Partial<ItemRow>) {
    onRowsChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function handleProductChange(index: number, value: string) {
    const productId = value === "" ? null : Number(value);
    if (productId !== null) {
      void loadVariants(productId).catch(() => undefined);
    }
    updateRow(index, { productId, variantId: null });
  }

  const derivedRows: Array<{ row: ItemRow; product: Product | null; variants: ProductVariant[] | undefined }> = rows.map(
    (row) => ({
      row,
      product: products?.find((p) => p.id === row.productId) ?? null,
      variants: row.productId === null ? undefined : variantMap.get(row.productId),
    }),
  );

  return (
    <div className="space-y-2">
      <ErrorTextInline error={error} />
      {products === null ? (
        <p className="text-sm text-slate-500">{"Loading catalogue\u2026"}</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_5rem_1fr_2rem] gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Product</span>
            <span>Variant</span>
            <span>Qty</span>
            <span>Tax</span>
            <span />
          </div>
          {derivedRows.map(({ row, variants }, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_5rem_1fr_2rem] items-center gap-2">
              <Select
                value={row.productId ?? ""}
                onChange={(event) => handleProductChange(index, event.target.value)}
              >
                <option value="">Choose a product…</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({formatMoney(product.salesPrice)})
                  </option>
                ))}
              </Select>
              <Select
                value={row.variantId ?? ""}
                disabled={row.productId === null}
                onChange={(event) =>
                  updateRow(index, { variantId: event.target.value === "" ? null : Number(event.target.value) })
                }
              >
                <option value="">Base product</option>
                {(variants ?? []).map((variant) => (
                  <option key={variant.id} value={variant.id} disabled={!variant.isActive}>
                    {variant.name} → {formatMoney(variant.effectivePrice)}
                  </option>
                ))}
              </Select>
              <TextInput
                inputMode="numeric"
                value={row.quantity}
                onChange={(event) => updateRow(index, { quantity: event.target.value })}
              />
              <Select
                value={row.taxId ?? ""}
                onChange={(event) =>
                  updateRow(index, { taxId: event.target.value === "" ? null : Number(event.target.value) })
                }
              >
                <option value="">No tax</option>
                {taxes.map((tax) => (
                  <option key={tax.id} value={tax.id}>
                    {tax.name} ({tax.taxMode.toLowerCase()})
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="danger"
                aria-label="Remove line"
                onClick={() => onRowsChange(rows.filter((_, i) => i !== index))}
              >
                {"\u00D7"}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() => onRowsChange([...rows, { productId: null, variantId: null, quantity: "1", taxId: null }])}
          >
            + Add line
          </Button>
          <p className="text-xs text-slate-500">
            Quantities count as exact units; eligible-badge products only. Prices are resolved by the server
            from the catalogue snapshots —{" "}
            <Badge tone="slate">never from this form</Badge>.
          </p>
        </div>
      )}
    </div>
  );
}

function ErrorTextInline({ error }: { error: ApiError | null }) {
  if (!error) {
    return null;
  }
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</div>
  );
}
