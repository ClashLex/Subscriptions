import { useCallback, useEffect, useState } from "react";
import { asApiError, request, type ApiError } from "../../lib/api.js";
import type { TaxRule } from "../../lib/types.js";
import { useSession } from "../../state/session.js";
import {
  Badge,
  Button,
  Checkbox,
  ErrorBanner,
  Field,
  Modal,
  PageHeading,
  Select,
  TableShell,
  TextInput,
} from "../../ui/components.js";

interface TaxDraft {
  name: string;
  rate: string;
  taxMode: "EXCLUSIVE" | "INCLUSIVE";
  isActive: boolean;
}

const EMPTY_DRAFT: TaxDraft = { name: "", rate: "", taxMode: "EXCLUSIVE", isActive: true };

export function TaxesPage() {
  const session = useSession();
  const isAdmin = session.isAdmin;
  const [rows, setRows] = useState<TaxRule[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [editor, setEditor] = useState<{ id: number | null; draft: TaxDraft; error?: ApiError } | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await request<TaxRule[]>("/taxes"));
      setError(null);
    } catch (caught) {
      setError(asApiError(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditor({ id: null, draft: { ...EMPTY_DRAFT } });
  }

  function openEdit(tax: TaxRule) {
    setEditor({ id: tax.id, draft: { name: tax.name, rate: tax.rate, taxMode: tax.taxMode, isActive: tax.isActive } });
  }

  async function save() {
    if (!editor) {
      return;
    }
    try {
      await request(editor.id === null ? "/taxes" : `/taxes/${editor.id}`, {
        method: editor.id === null ? "POST" : "PATCH",
        body: {
          name: editor.draft.name.trim(),
          rate: editor.draft.rate.trim(),
          taxMode: editor.draft.taxMode,
          isActive: editor.draft.isActive,
        },
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
        title="Taxes"
        subtitle={"Rates are decimal strings (0\u201399.99). EXCLUSIVE adds on top; INCLUSIVE is already inside prices."}
      />
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-slate-500">{rows === null ? "Loading\u2026" : `${rows.length} rule(s)`}</span>
        {isAdmin ? <Button onClick={openCreate}>New tax rule</Button> : null}
      </div>

      <ErrorBanner error={error} />
      <TableShell
        head={
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Rate</th>
            <th className="px-3 py-2">Mode</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        }
      >
        {rows === null ? (
          <tr>
            <td colSpan={5} className="px-3 py-6 text-center text-slate-500">{"Loading\u2026"}</td>
          </tr>
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={5} className="px-3 py-6 text-center text-slate-500">No tax rules yet.</td>
          </tr>
        ) : (
          rows.map((tax) => (
            <tr key={tax.id}>
              <td className="px-3 py-2 font-medium text-slate-900">{tax.name}</td>
              <td className="px-3 py-2 text-slate-700">{tax.rate}%</td>
              <td className="px-3 py-2 text-slate-600">{tax.taxMode}</td>
              <td className="px-3 py-2">
                {tax.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}
              </td>
              <td className="px-3 py-2 text-right">
                {isAdmin ? (
                  <Button variant="secondary" onClick={() => openEdit(tax)}>
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

      <Modal
        open={editor !== null}
        title={editor?.id === null ? "New tax rule" : "Edit tax rule"}
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
                maxLength={120}
                value={editor.draft.name}
                onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, name: event.target.value } })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rate (%)">
                <TextInput
                  required
                  inputMode="decimal"
                  placeholder="18.00"
                  value={editor.draft.rate}
                  onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, rate: event.target.value } })}
                />
              </Field>
              <Field label="Mode">
                <Select
                  value={editor.draft.taxMode}
                  onChange={(event) =>
                    setEditor({ ...editor, draft: { ...editor.draft, taxMode: event.target.value as "EXCLUSIVE" | "INCLUSIVE" } })
                  }
                >
                  <option value="EXCLUSIVE">EXCLUSIVE — added on top</option>
                  <option value="INCLUSIVE">INCLUSIVE — included in price</option>
                </Select>
              </Field>
            </div>
            <Checkbox
              label="Active"
              checked={editor.draft.isActive}
              onChange={(value) => setEditor({ ...editor, draft: { ...editor.draft, isActive: value } })}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              <Button type="submit">Save tax rule</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
