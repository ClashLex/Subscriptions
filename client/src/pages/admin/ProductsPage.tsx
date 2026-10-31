import { useCallback, useEffect, useState } from "react";
import {
  asApiError,
  formatMoney,
  list,
  request,
  type ApiError,
  type PageMeta,
} from "../../lib/api.js";
import type { Product, ProductVariant, ProductWithVariants } from "../../lib/types.js";
import { useSession } from "../../state/session.js";
import {
  Badge,
  Button,
  Checkbox,
  ErrorBanner,
  Field,
  Modal,
  PageHeading,
  Pagination,
  TableShell,
  TextArea,
  TextInput,
} from "../../ui/components.js";

interface ProductDraft {
  name: string;
  type: string;
  salesPrice: string;
  costPrice: string;
  notes: string;
  isActive: boolean;
}

const EMPTY_DRAFT: ProductDraft = {
  name: "",
  type: "",
  salesPrice: "",
  costPrice: "",
  notes: "",
  isActive: true,
};

const PAGE_SIZE = 10;

export function ProductsPage() {
  const session = useSession();
  const isAdmin = session.isAdmin;
  const [rows, setRows] = useState<Product[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const [editor, setEditor] = useState<{ id: number | null; draft: ProductDraft; error?: ApiError } | null>(null);
  const [variantPanel, setVariantPanel] = useState<Product | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (search.trim().length > 0) {
        params.set("search", search.trim());
      }
      if (includeInactive) {
        params.set("includeInactive", "1");
      }
      const response = await list<Product>(`/products?${params.toString()}`);
      setRows(response.data);
      setMeta(response.meta);
      setError(null);
    } catch (caught) {
      setError(asApiError(caught));
    } finally {
      setLoading(false);
    }
  }, [page, includeInactive, search]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditor({ id: null, draft: { ...EMPTY_DRAFT } });
  }

  function openEdit(product: Product) {
    setEditor({
      id: product.id,
      draft: {
        name: product.name,
        type: product.type,
        salesPrice: product.salesPrice,
        costPrice: product.costPrice,
        notes: product.notes ?? "",
        isActive: product.isActive,
      },
    });
  }

  async function save() {
    if (!editor) {
      return;
    }
    const body = {
      name: editor.draft.name.trim(),
      type: editor.draft.type.trim(),
      salesPrice: editor.draft.salesPrice.trim(),
      costPrice: editor.draft.costPrice.trim(),
      notes: editor.draft.notes.trim().length > 0 ? editor.draft.notes.trim() : undefined,
      isActive: editor.draft.isActive,
    };
    try {
      await request(editor.id === null ? "/products" : `/products/${editor.id}`, {
        method: editor.id === null ? "POST" : "PATCH",
        body,
      });
      setEditor(null);
      await load();
    } catch (caught) {
      setEditor({ ...editor, error: asApiError(caught) });
    }
  }

  return (
    <div>
      <PageHeading
        title="Products & variants"
        subtitle="Sales price is the product base; each variant adds a signed price adjustment to form the effective price."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <TextInput
            placeholder={"Search name or type\u2026"}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-64"
          />
          <Checkbox label="Show inactive" checked={includeInactive} onChange={(v) => { setPage(1); setIncludeInactive(v); }} />
        </div>
        {isAdmin ? <Button onClick={openCreate}>New product</Button> : null}
      </div>

      <ErrorBanner error={error} />
      <TableShell
        head={
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Sales price</th>
            <th className="px-3 py-2">Cost price</th>
            <th className="px-3 py-2">Variants</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        }
      >
        {loading ? (
          <tr>
            <td colSpan={7} className="px-3 py-6 text-center text-slate-500">{"Loading\u2026"}</td>
          </tr>
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
              No products match the current filters.
            </td>
          </tr>
        ) : (
          rows.map((product) => (
            <tr key={product.id} className="align-middle">
              <td className="px-3 py-2 font-medium text-slate-900">{product.name}</td>
              <td className="px-3 py-2 text-slate-600">{product.type}</td>
              <td className="px-3 py-2 text-slate-700">{formatMoney(product.salesPrice)}</td>
              <td className="px-3 py-2 text-slate-500">{formatMoney(product.costPrice)}</td>
              <td className="px-3 py-2">
                <Button
                  variant="ghost"
                  onClick={() => setVariantPanel(product)}
                >
                  {product.variantCount} variant(s)
                </Button>
              </td>
              <td className="px-3 py-2">
                {product.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}
              </td>
              <td className="px-3 py-2 text-right">
                {isAdmin ? (
                  <Button variant="secondary" onClick={() => openEdit(product)}>
                    Edit
                  </Button>
                ) : (
                  <span className="text-xs text-slate-400">Read-only</span>
                )}
              </td>
            </tr>
          ))
        )}
      </TableShell>
      <Pagination meta={meta} onPage={setPage} />

      {/* ---------------- Product editor ---------------- */}
      <Modal
        open={editor !== null}
        title={editor?.id === null ? "New product" : "Edit product"}
        onClose={() => setEditor(null)}
      >
        {editor ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <ErrorBanner error={editor.error ?? null} />
            <Field label="Name">
              <TextInput
                required
                maxLength={255}
                value={editor.draft.name}
                onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, name: event.target.value } })}
              />
            </Field>
            <Field label="Type">
              <TextInput
                placeholder="Device / License / Service"
                required
                maxLength={80}
                value={editor.draft.type}
                onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, type: event.target.value } })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sales price (base)">
                <TextInput
                  required
                  inputMode="decimal"
                  placeholder="120.00"
                  value={editor.draft.salesPrice}
                  onChange={(event) =>
                    setEditor({ ...editor, draft: { ...editor.draft, salesPrice: event.target.value } })
                  }
                />
              </Field>
              <Field label="Cost price">
                <TextInput
                  required
                  inputMode="decimal"
                  placeholder="40.00"
                  value={editor.draft.costPrice}
                  onChange={(event) =>
                    setEditor({ ...editor, draft: { ...editor.draft, costPrice: event.target.value } })
                  }
                />
              </Field>
            </div>
            <Field label="Notes">
              <TextArea
                rows={2}
                maxLength={2000}
                value={editor.draft.notes}
                onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, notes: event.target.value } })}
              />
            </Field>
            <Checkbox
              label="Active (visible in the catalogue)"
              checked={editor.draft.isActive}
              onChange={(value) => setEditor({ ...editor, draft: { ...editor.draft, isActive: value } })}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              <Button type="submit">Save product</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <VariantPanel
        open={variantPanel !== null}
        product={variantPanel}
        isAdmin={isAdmin}
        onClose={() => setVariantPanel(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function VariantPanel({
  open,
  product,
  isAdmin,
  onClose,
}: {
  open: boolean;
  product: Product | null;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ProductWithVariants | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [adding, setAdding] = useState({ name: "", priceAdjustment: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editing, setEditing] = useState({ name: "", priceAdjustment: "" });

  const load = useCallback(async () => {
    if (!product) {
      return;
    }
    try {
      setDetail(await request<ProductWithVariants>(`/products/${product.id}`));
      setError(null);
    } catch (caught) {
      setError(asApiError(caught));
    }
  }, [product]);

  useEffect(() => {
    setDetail(null);
    setError(null);
    setAdding({ name: "", priceAdjustment: "" });
    setEditingId(null);
    if (open) {
      void load();
    }
  }, [open, load]);

  async function addVariant() {
    if (!product) {
      return;
    }
    try {
      await request(`/products/${product.id}/variants`, {
        method: "POST",
        body: { name: adding.name.trim(), priceAdjustment: adding.priceAdjustment.trim() },
      });
      setAdding({ name: "", priceAdjustment: "" });
      await load();
    } catch (caught) {
      setError(asApiError(caught));
    }
  }

  async function saveVariant(variant: ProductVariant) {
    if (!product) {
      return;
    }
    try {
      await request(`/products/${product.id}/variants/${variant.id}`, {
        method: "PATCH",
        body: { name: editing.name.trim(), priceAdjustment: editing.priceAdjustment.trim() },
      });
      setEditingId(null);
      await load();
    } catch (caught) {
      setError(asApiError(caught));
    }
  }

  const variants = detail?.variants ?? [];

  return (
    <Modal
      open={open}
      wide
      onClose={onClose}
      title={detail ? `Variants of ${detail.name} (base ${formatMoney(detail.salesPrice)})` : "Variants"}
    >
      <div className="space-y-3">
        <ErrorBanner error={error} />
        {detail === null ? (
          <p className="text-sm text-slate-500">{"Loading\u2026"}</p>
        ) : variants.length === 0 ? (
          <p className="text-sm text-slate-500">No variants yet — the bare product sells at its base price.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {variants.map((variant) => (
              <li key={variant.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-40 flex-1">
                  {editingId === variant.id ? (
                    <div className="flex gap-2">
                      <TextInput
                        value={editing.name}
                        onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                      />
                      <TextInput
                        className="w-28"
                        inputMode="decimal"
                        value={editing.priceAdjustment}
                        onChange={(event) => setEditing({ ...editing, priceAdjustment: event.target.value })}
                      />
                    </div>
                  ) : (
                    <>
                      <p className="font-medium text-slate-900">{variant.name}</p>
                      <p className="text-xs text-slate-500">
                        Adjustment {variant.priceAdjustment}
                      </p>
                    </>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">{formatMoney(variant.effectivePrice)}</p>
                  <p className="text-xs text-slate-500">effective</p>
                </div>
                <div className="flex items-center gap-2 pl-2">
                  {variant.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}
                  {isAdmin ? (
                    editingId === variant.id ? (
                      <>
                        <Button onClick={() => void saveVariant(variant)}>Save</Button>
                        <Button variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditingId(variant.id);
                          setEditing({ name: variant.name, priceAdjustment: variant.priceAdjustment });
                        }}
                      >
                        Edit
                      </Button>
                    )
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {detail !== null && isAdmin ? (
          <form
            className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void addVariant();
            }}
          >
            <div className="min-w-40 flex-1">
              <Field label="New variant name">
                <TextInput
                  required
                  maxLength={255}
                  value={adding.name}
                  onChange={(event) => setAdding({ ...adding, name: event.target.value })}
                />
              </Field>
            </div>
            <div className="w-28">
              <Field label="Price adj.">
                <TextInput
                  required
                  inputMode="decimal"
                  placeholder="560.00 / -10.00"
                  value={adding.priceAdjustment}
                  onChange={(event) => setAdding({ ...adding, priceAdjustment: event.target.value })}
                />
              </Field>
            </div>
            <Button type="submit">Add variant</Button>
          </form>
        ) : null}
      </div>
    </Modal>
  );
}
