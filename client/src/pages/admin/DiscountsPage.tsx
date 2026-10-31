import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, asApiError, formatMoney, list, request, type PageMeta } from "../../lib/api.js";
import type { DiscountRule, Product } from "../../lib/types.js";
import { useSession } from "../../state/session.js";
import { Badge, Button, Checkbox, ErrorBanner, Field, Modal, PageHeading, Pagination, Select, TableShell, TextInput } from "../../ui/components.js";

type Draft = {
  name: string; discountType: "FIXED" | "PERCENTAGE"; value: string;
  minimumPurchase: string; minimumQuantity: string; startsAt: string; endsAt: string;
  usageLimit: string; scope: "PRODUCTS" | "SUBSCRIPTION"; productIds: number[];
};
const EMPTY: Draft = { name: "", discountType: "FIXED", value: "", minimumPurchase: "", minimumQuantity: "", startsAt: "", endsAt: "", usageLimit: "", scope: "SUBSCRIPTION", productIds: [] };
type Editor = { id: number | null; draft: Draft; error: ApiError | null };

function fromRule(rule: DiscountRule): Draft {
  return {
    name: rule.name, discountType: rule.discountType, value: rule.value,
    minimumPurchase: rule.minimumPurchase ?? "", minimumQuantity: rule.minimumQuantity?.toString() ?? "",
    startsAt: rule.startsAt ?? "", endsAt: rule.endsAt ?? "", usageLimit: rule.usageLimit?.toString() ?? "",
    scope: rule.scope, productIds: [...rule.productIds],
  };
}

export function DiscountsPage() {
  const isAdmin = useSession().isAdmin;
  const [rows, setRows] = useState<DiscountRule[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [productMeta, setProductMeta] = useState<PageMeta | null>(null);
  const [productError, setProductError] = useState<ApiError | null>(null);
  const editorId = editor?.id;
  const editorScope = editor?.draft.scope;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await list<DiscountRule>(`/discounts${isAdmin && includeInactive ? "?includeInactive=true" : ""}`);
      setRows(result.data);
      setError(null);
    } catch (caught) {
      setError(asApiError(caught));
    } finally {
      setLoading(false);
    }
  }, [includeInactive, isAdmin]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (editorId === undefined || editorScope !== "PRODUCTS") return;
    let active = true;
    const params = new URLSearchParams({ page: String(productPage), pageSize: "100", includeInactive: "1" });
    if (productSearch.trim()) params.set("search", productSearch.trim());
    void list<Product>(`/products?${params}`).then((result) => {
      if (active) { setProducts(result.data); setProductMeta(result.meta); setProductError(null); }
    }).catch((caught: unknown) => { if (active) setProductError(asApiError(caught)); });
    return () => { active = false; };
  }, [editorId, editorScope, productPage, productSearch]);

  function setDraft(patch: Partial<Draft>) {
    setEditor((current) => current ? { ...current, error: null, draft: { ...current.draft, ...patch } } : null);
  }

  function openCreate() {
    setProductSearch(""); setProductPage(1);
    setEditor({ id: null, draft: { ...EMPTY, productIds: [] }, error: null });
  }

  function openEdit(rule: DiscountRule) {
    setProductSearch(""); setProductPage(1);
    setEditor({ id: rule.id, draft: fromRule(rule), error: null });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || saving) return;
    const { draft } = editor;
    if (!/^\d+(?:\.\d{1,2})?$/.test(draft.value) || (draft.minimumPurchase && !/^\d+(?:\.\d{1,2})?$/.test(draft.minimumPurchase))) {
      setEditor({ ...editor, error: new ApiError(0, "INVALID_MONEY", "Enter monetary amounts with at most two decimal places.") });
      return;
    }
    if (draft.discountType === "PERCENTAGE" && Number(draft.value) > 100) {
      setEditor({ ...editor, error: new ApiError(0, "INVALID_PERCENTAGE", "Percentage discounts cannot exceed 100.") });
      return;
    }
    if (draft.startsAt && draft.endsAt && draft.endsAt < draft.startsAt) {
      setEditor({ ...editor, error: new ApiError(0, "INVALID_WINDOW", "The end date must not precede the start date.") });
      return;
    }
    if (draft.scope === "PRODUCTS" && draft.productIds.length === 0) {
      setEditor({ ...editor, error: new ApiError(0, "PRODUCT_REQUIRED", "Select at least one product.") });
      return;
    }
    const body = {
      name: draft.name.trim(), value: draft.value.trim(), scope: draft.scope,
      minimumPurchase: draft.minimumPurchase || (editor.id === null ? undefined : null),
      minimumQuantity: draft.minimumQuantity ? Number(draft.minimumQuantity) : (editor.id === null ? undefined : null),
      startsAt: draft.startsAt || (editor.id === null ? undefined : null),
      endsAt: draft.endsAt || (editor.id === null ? undefined : null),
      usageLimit: draft.usageLimit ? Number(draft.usageLimit) : (editor.id === null ? undefined : null),
      productIds: draft.scope === "PRODUCTS" ? draft.productIds : [],
      ...(editor.id === null ? { discountType: draft.discountType } : {}),
    };
    setSaving(true);
    try {
      await request<DiscountRule>(editor.id === null ? "/discounts" : `/discounts/${editor.id}`, { method: editor.id === null ? "POST" : "PATCH", body });
      setEditor(null);
      await load();
    } catch (caught) {
      setEditor({ ...editor, error: asApiError(caught) });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(rule: DiscountRule) {
    if (!window.confirm(`${rule.isActive ? "Deactivate" : "Reactivate"} ${rule.name}?`)) return;
    try {
      await request<DiscountRule>(`/discounts/${rule.id}`, { method: "PATCH", body: { isActive: !rule.isActive } });
      await load();
    } catch (caught) {
      setError(asApiError(caught));
    }
  }

  return <div>
    <PageHeading title="Discounts" subtitle="Create fixed or percentage rules for subscriptions or selected products. Eligible rules are applied during billing." />
    <div className="mb-4 flex items-center justify-between gap-3">{isAdmin ? <Checkbox label="Show inactive" checked={includeInactive} onChange={setIncludeInactive} /> : <span className="text-sm text-slate-500">Active rules</span>}{isAdmin ? <Button onClick={openCreate}>New discount</Button> : null}</div>
    <ErrorBanner error={error} />
    <TableShell head={<tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Value</th><th className="px-3 py-2">Scope</th><th className="px-3 py-2">Eligibility</th><th className="px-3 py-2">Usage</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr>}>
      {loading ? <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr> : rows.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No discount rules found.</td></tr> : rows.map((rule) => <tr key={rule.id}><td className="px-3 py-2 font-medium">{rule.name}</td><td className="px-3 py-2">{rule.discountType === "FIXED" ? formatMoney(rule.value) : `${rule.value}%`}</td><td className="px-3 py-2">{rule.scope === "PRODUCTS" ? `${rule.productIds.length} product(s)` : "Subscription"}</td><td className="px-3 py-2 text-xs text-slate-600">{rule.minimumPurchase ? `Min ${formatMoney(rule.minimumPurchase)} · ` : ""}{rule.minimumQuantity ? `Qty ${rule.minimumQuantity} · ` : ""}{rule.startsAt ?? "Any time"} → {rule.endsAt ?? "No end"}</td><td className="px-3 py-2">{rule.usageCount}{rule.usageLimit ? ` / ${rule.usageLimit}` : ""}</td><td className="px-3 py-2"><Badge tone={rule.isActive ? "green" : "slate"}>{rule.isActive ? "Active" : "Inactive"}</Badge></td><td className="px-3 py-2 text-right">{isAdmin ? <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => openEdit(rule)}>Edit</Button><Button variant={rule.isActive ? "danger" : "secondary"} onClick={() => void toggle(rule)}>{rule.isActive ? "Deactivate" : "Reactivate"}</Button></div> : <span className="text-xs text-slate-400">Read-only</span>}</td></tr>)}
    </TableShell>
    <Modal open={editor !== null} title={editor?.id === null ? "New discount" : "Edit discount"} onClose={() => { if (!saving) setEditor(null); }} wide>
      {editor ? <form className="space-y-4" onSubmit={(event) => void save(event)}>
        <ErrorBanner error={editor.error} />
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Name"><TextInput required maxLength={255} value={editor.draft.name} onChange={(event) => setDraft({ name: event.target.value })} /></Field><Field label="Type"><Select value={editor.draft.discountType} disabled={editor.id !== null} onChange={(event) => setDraft({ discountType: event.target.value as Draft["discountType"] })}><option value="FIXED">Fixed amount</option><option value="PERCENTAGE">Percentage</option></Select></Field><Field label={editor.draft.discountType === "FIXED" ? "Amount" : "Percentage"}><TextInput required inputMode="decimal" value={editor.draft.value} onChange={(event) => setDraft({ value: event.target.value })} /></Field></div>
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Minimum purchase"><TextInput inputMode="decimal" value={editor.draft.minimumPurchase} onChange={(event) => setDraft({ minimumPurchase: event.target.value })} /></Field><Field label="Minimum quantity"><TextInput type="number" min="1" max="100000" value={editor.draft.minimumQuantity} onChange={(event) => setDraft({ minimumQuantity: event.target.value })} /></Field><Field label="Usage limit"><TextInput type="number" min="1" max="1000000" value={editor.draft.usageLimit} onChange={(event) => setDraft({ usageLimit: event.target.value })} /></Field></div>
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Starts on"><TextInput type="date" value={editor.draft.startsAt} onChange={(event) => setDraft({ startsAt: event.target.value })} /></Field><Field label="Ends on"><TextInput type="date" value={editor.draft.endsAt} onChange={(event) => setDraft({ endsAt: event.target.value })} /></Field><Field label="Scope"><Select value={editor.draft.scope} onChange={(event) => setDraft({ scope: event.target.value as Draft["scope"] })}><option value="SUBSCRIPTION">Whole subscription</option><option value="PRODUCTS">Selected products</option></Select></Field></div>
        {editor.draft.scope === "PRODUCTS" ? <div className="space-y-2 rounded-lg border border-slate-200 p-3"><p className="text-sm font-medium">Products ({editor.draft.productIds.length} selected)</p><TextInput placeholder="Search products" maxLength={80} value={productSearch} onChange={(event) => { setProductPage(1); setProductSearch(event.target.value); }} /><ErrorBanner error={productError} /><div className="max-h-40 space-y-1 overflow-y-auto">{products.map((product) => <Checkbox key={product.id} label={`${product.name} (#${product.id})${product.isActive ? "" : " · inactive"}`} checked={editor.draft.productIds.includes(product.id)} onChange={(checked) => setDraft({ productIds: checked ? [...editor.draft.productIds, product.id] : editor.draft.productIds.filter((id) => id !== product.id) })} />)}</div><Pagination meta={productMeta} onPage={setProductPage} /><p className="text-xs text-slate-500">Selected IDs: {editor.draft.productIds.join(", ") || "none"}. Selection stays when you search or change page.</p></div> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditor(null)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save discount"}</Button></div>
      </form> : null}
    </Modal>
  </div>;
}
