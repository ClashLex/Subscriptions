import { useCallback, useEffect, useState } from "react";
import { asApiError, list, request, type ApiError } from "../../lib/api.js";
import type { Plan, QuotationTemplate, TaxRule } from "../../lib/types.js";
import { Button, ErrorBanner, Field, Modal, PageHeading, Select, TableShell, TextInput } from "../../ui/components.js";
import { ItemsEditor, type ItemRow } from "../../ui/ItemsEditor.js";

interface TemplateDraft {
  name: string;
  validityDays: string;
  defaultPlanId: number | null;
}

const EMPTY_DRAFT: TemplateDraft = { name: "", validityDays: "15", defaultPlanId: null };

export function TemplatesPage() {
  const [rows, setRows] = useState<QuotationTemplate[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [taxes, setTaxes] = useState<Array<{ id: number; name: string; taxMode: string }>>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [editor, setEditor] = useState<{
    id: number | null;
    draft: TemplateDraft;
    items: ItemRow[];
    error?: ApiError;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await list<QuotationTemplate>("/quotation-templates?pageSize=100");
      setRows(response.data);
      setError(null);
    } catch (caught) {
      setError(asApiError(caught));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void list<Plan>("/plans?pageSize=100")
      .then((response) => setPlans(response.data))
      .catch(() => undefined);
    void request<TaxRule[]>("/taxes")
      .then((response) =>
        setTaxes(response.map((tax) => ({ id: tax.id, name: tax.name, taxMode: tax.taxMode }))),
      )
      .catch(() => undefined);
  }, []);

  async function save() {
    if (!editor) {
      return;
    }
    if (editor.draft.name.trim().length === 0 || editor.items.length === 0) {
      setEditor({ ...editor, error: asApiError(new Error("A template needs a name and at least one line.")) });
      return;
    }
    const items = editor.items
      .filter((row) => row.productId !== null)
      .map((row) => ({
        productId: Number(row.productId),
        variantId: row.variantId ?? undefined,
        quantity: Math.max(Number.parseInt(row.quantity, 10) || 1, 1),
        taxId: row.taxId ?? undefined,
        isAddOn: row.isAddOn,
      }));
    const body = {
      name: editor.draft.name.trim(),
      validityDays: Math.max(Number.parseInt(editor.draft.validityDays, 10) || 15, 1),
      defaultPlanId: editor.draft.defaultPlanId ?? undefined,
      items,
    };
    try {
      await request(editor.id === null ? "/quotation-templates" : `/quotation-templates/${editor.id}`, {
        method: editor.id === null ? "POST" : "PATCH",
        body,
      });
      setEditor(null);
      await refresh();
    } catch (caught) {
      setEditor({ ...editor, error: asApiError(caught) });
    }
  }

  function openCreate() {
    setEditor({ id: null, draft: { ...EMPTY_DRAFT }, items: [] });
  }

  function openEdit(template: QuotationTemplate) {
    setEditor({
      id: template.id,
      draft: {
        name: template.name,
        validityDays: String(template.validityDays),
        defaultPlanId: template.defaultPlanId,
      },
      items: template.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: String(item.quantity),
        taxId: item.taxId,
        isAddOn: item.isAddOn,
      })),
    });
  }

  return (
    <div>
      <PageHeading
        title="Quotation templates"
        subtitle="Reusable offer bundles. Add-ons keep their catalogue snapshot; the first core line uses the selected plan price when a subscription is created."
      />
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-slate-500">{rows === null ? "Loading…" : `${rows.length} template(s)`}</span>
        <Button onClick={openCreate}>New template</Button>
      </div>
      <ErrorBanner error={error} />
      <TableShell
        head={
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Validity</th>
            <th className="px-3 py-2">Default plan</th>
            <th className="px-3 py-2">Items</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        }
      >
        {rows === null ? (
          <tr>
            <td colSpan={5} className="px-3 py-6 text-center text-slate-500">{"Loading…"}</td>
          </tr>
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={5} className="px-3 py-6 text-center text-slate-500">No templates yet.</td>
          </tr>
        ) : (
          rows.map((template) => (
            <tr key={template.id}>
              <td className="px-3 py-2 font-medium text-slate-900">{template.name}</td>
              <td className="px-3 py-2 text-slate-600">{template.validityDays} day(s)</td>
              <td className="px-3 py-2 text-slate-600">{template.defaultPlanName ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-slate-600">
                {template.items.map((item) => `${item.quantity}× ${item.productName}${item.variantName ? ` (${item.variantName})` : ""}`).join(", ")}
              </td>
              <td className="px-3 py-2 text-right">
                <Button variant="secondary" onClick={() => openEdit(template)}>
                  Edit
                </Button>
              </td>
            </tr>
          ))
        )}
      </TableShell>

      <Modal open={editor !== null} title={editor?.id === null ? "New template" : "Edit template"} onClose={() => setEditor(null)} wide>
        {editor ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <ErrorBanner error={editor.error ?? null} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <TextInput
                  required
                  value={editor.draft.name}
                  onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, name: event.target.value } })}
                />
              </Field>
              <Field label="Quotation validity (days)">
                <TextInput
                  required
                  inputMode="numeric"
                  value={editor.draft.validityDays}
                  onChange={(event) =>
                    setEditor({ ...editor, draft: { ...editor.draft, validityDays: event.target.value } })
                  }
                />
              </Field>
            </div>
            <Field label="Default plan (optional)">
              <Select
                value={editor.draft.defaultPlanId ?? ""}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    draft: { ...editor.draft, defaultPlanId: event.target.value === "" ? null : Number(event.target.value) },
                  })
                }
              >
                <option value="">None</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Template items</p>
              <ItemsEditor
                rows={editor.items}
                onRowsChange={(items) => setEditor({ ...editor, items })}
                taxes={taxes}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              <Button type="submit">Save template</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
