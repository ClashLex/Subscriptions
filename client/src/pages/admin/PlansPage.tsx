import { useCallback, useEffect, useState } from "react";
import { asApiError, formatMoney, list, request, type ApiError, type PageMeta } from "../../lib/api.js";
import { INTERVAL_UNITS, intervalLabel, type BillingIntervalUnit, type Plan } from "../../lib/types.js";
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
  Select,
  TableShell,
  TextArea,
  TextInput,
} from "../../ui/components.js";

interface PlanDraft {
  name: string;
  description: string;
  price: string;
  billingIntervalUnit: BillingIntervalUnit;
  billingIntervalCount: string;
  minimumQuantity: string;
  availableFrom: string;
  availableUntil: string;
  allowPause: boolean;
  allowEarlyClose: boolean;
  allowRenewal: boolean;
  autoClose: boolean;
  isActive: boolean;
}

const EMPTY_DRAFT: PlanDraft = {
  name: "",
  description: "",
  price: "",
  billingIntervalUnit: "MONTH",
  billingIntervalCount: "1",
  minimumQuantity: "1",
  availableFrom: "",
  availableUntil: "",
  allowPause: true,
  allowEarlyClose: true,
  allowRenewal: true,
  autoClose: false,
  isActive: true,
};

const PAGE_SIZE = 10;

export function PlansPage() {
  const session = useSession();
  const isAdmin = session.isAdmin;
  const [rows, setRows] = useState<Plan[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [editor, setEditor] = useState<{ id: number | null; draft: PlanDraft; error?: ApiError } | null>(null);
  // Captured once per mount so render stays pure.
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (includeInactive) {
        params.set("includeInactive", "1");
      }
      const response = await list<Plan>(`/plans?${params.toString()}`);
      setRows(response.data);
      setMeta(response.meta);
      setError(null);
    } catch (caught) {
      setError(asApiError(caught));
    } finally {
      setLoading(false);
    }
  }, [page, includeInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditor({ id: null, draft: { ...EMPTY_DRAFT } });
  }

  function openEdit(plan: Plan) {
    setEditor({
      id: plan.id,
      draft: {
        name: plan.name,
        description: plan.description ?? "",
        price: plan.price,
        billingIntervalUnit: plan.billingIntervalUnit,
        billingIntervalCount: String(plan.billingIntervalCount),
        minimumQuantity: String(plan.minimumQuantity),
        availableFrom: plan.availableFrom ?? "",
        availableUntil: plan.availableUntil ?? "",
        allowPause: plan.allowPause,
        allowEarlyClose: plan.allowEarlyClose,
        allowRenewal: plan.allowRenewal,
        autoClose: plan.autoClose,
        isActive: plan.isActive,
      },
    });
  }

  /** Empty dates become null on the wire so editing can clear the window. */
  function normalizeDate(value: string): string | null {
    return value.trim().length === 0 ? null : value.trim();
  }

  async function save() {
    if (!editor) {
      return;
    }
    const quantity = Math.max(Number.parseInt(editor.draft.billingIntervalCount, 10) || 1, 1);
    const minimum = Math.max(Number.parseInt(editor.draft.minimumQuantity, 10) || 1, 1);
    try {
      await request(editor.id === null ? "/plans" : `/plans/${editor.id}`, {
        method: editor.id === null ? "POST" : "PATCH",
        body: {
          name: editor.draft.name.trim(),
          description: editor.draft.description.trim().length > 0 ? editor.draft.description.trim() : undefined,
          price: editor.draft.price.trim(),
          billingIntervalUnit: editor.draft.billingIntervalUnit,
          billingIntervalCount: quantity,
          minimumQuantity: minimum,
          availableFrom: normalizeDate(editor.draft.availableFrom),
          availableUntil: normalizeDate(editor.draft.availableUntil),
          allowPause: editor.draft.allowPause,
          allowEarlyClose: editor.draft.allowEarlyClose,
          allowRenewal: editor.draft.allowRenewal,
          autoClose: editor.draft.autoClose,
          isActive: editor.draft.isActive,
        },
      });
      setEditor(null);
      await load();
    } catch (caught) {
      setEditor({ ...editor, error: asApiError(caught) });
    }
  }

  function availabilityBadge(plan: Plan) {
    const started = plan.availableFrom === null || plan.availableFrom <= today;
    const notEnded = plan.availableUntil === null || plan.availableUntil >= today;
    if (plan.isActive && started && notEnded) {
      return <Badge tone="green">Sellable</Badge>;
    }
    return <Badge tone="amber">Not currently sellable</Badge>;
  }

  return (
    <div>
      <PageHeading
        title="Plans"
        subtitle="Plan price sets the first core subscription line's recurring price; optional add-ons use catalogue prices."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Checkbox
          label="Show all (including inactive)"
          checked={includeInactive}
          onChange={(value) => {
            setPage(1);
            setIncludeInactive(value);
          }}
        />
        {isAdmin ? <Button onClick={openCreate}>New plan</Button> : null}
      </div>

      <ErrorBanner error={error} />
      <TableShell
        head={
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Recurring price</th>
            <th className="px-3 py-2">Billing</th>
            <th className="px-3 py-2">Min qty</th>
            <th className="px-3 py-2">Availability</th>
            <th className="px-3 py-2">Policy</th>
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
            <td colSpan={7} className="px-3 py-6 text-center text-slate-500">No plans yet.</td>
          </tr>
        ) : (
          rows.map((plan) => (
            <tr key={plan.id}>
              <td className="px-3 py-2 font-medium text-slate-900">
                {plan.name}
                {!plan.isActive ? <span className="ml-2"><Badge tone="slate">Inactive</Badge></span> : null}
              </td>
              <td className="px-3 py-2 text-slate-700">{formatMoney(plan.price)}</td>
              <td className="px-3 py-2 text-slate-600">{intervalLabel(plan.billingIntervalUnit, plan.billingIntervalCount)}</td>
              <td className="px-3 py-2 text-slate-600">{plan.minimumQuantity}</td>
              <td className="px-3 py-2 text-xs text-slate-600">
                {plan.availableFrom ?? "\u221E"} {"\u2192"} {plan.availableUntil ?? "\u221E"}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {plan.allowPause ? <Badge tone="indigo">Pause</Badge> : null}
                  {plan.allowEarlyClose ? <Badge tone="indigo">Early close</Badge> : null}
                  {plan.allowRenewal ? <Badge tone="indigo">Renew</Badge> : null}
                  {plan.autoClose ? <Badge tone="amber">Auto-close</Badge> : null}
                  {availabilityBadge(plan)}
                </div>
              </td>
              <td className="px-3 py-2 text-right">
                {isAdmin ? (
                  <Button variant="secondary" onClick={() => openEdit(plan)}>
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

      <Modal
        open={editor !== null}
        title={editor?.id === null ? "New plan" : "Edit plan"}
        onClose={() => setEditor(null)}
        wide
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
            <Field label="Description">
              <TextArea
                rows={2}
                maxLength={2000}
                value={editor.draft.description}
                onChange={(event) =>
                  setEditor({ ...editor, draft: { ...editor.draft, description: event.target.value } })
                }
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Primary line recurring price">
                <TextInput
                  required
                  inputMode="decimal"
                  placeholder="999.00"
                  value={editor.draft.price}
                  onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, price: event.target.value } })}
                />
              </Field>
              <Field label="Billing interval">
                <Select
                  value={editor.draft.billingIntervalUnit}
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      draft: { ...editor.draft, billingIntervalUnit: event.target.value as BillingIntervalUnit },
                    })
                  }
                >
                  {INTERVAL_UNITS.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Every n unit(s)">
                <TextInput
                  required
                  inputMode="numeric"
                  value={editor.draft.billingIntervalCount}
                  onChange={(event) =>
                    setEditor({ ...editor, draft: { ...editor.draft, billingIntervalCount: event.target.value } })
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Minimum quantity">
                <TextInput
                  required
                  inputMode="numeric"
                  value={editor.draft.minimumQuantity}
                  onChange={(event) =>
                    setEditor({ ...editor, draft: { ...editor.draft, minimumQuantity: event.target.value } })
                  }
                />
              </Field>
              <Field label="Available from (YYYY-MM-DD)">
                <TextInput
                  value={editor.draft.availableFrom}
                  onChange={(event) =>
                    setEditor({ ...editor, draft: { ...editor.draft, availableFrom: event.target.value } })
                  }
                />
              </Field>
              <Field label="Available until (YYYY-MM-DD)">
                <TextInput
                  value={editor.draft.availableUntil}
                  onChange={(event) =>
                    setEditor({ ...editor, draft: { ...editor.draft, availableUntil: event.target.value } })
                  }
                />
              </Field>
            </div>
            <fieldset className="rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Lifecycle policy
              </legend>
              <div className="flex flex-wrap gap-4">
                <Checkbox
                  label="Allow pause"
                  checked={editor.draft.allowPause}
                  onChange={(value) => setEditor({ ...editor, draft: { ...editor.draft, allowPause: value } })}
                />
                <Checkbox
                  label="Allow early close"
                  checked={editor.draft.allowEarlyClose}
                  onChange={(value) => setEditor({ ...editor, draft: { ...editor.draft, allowEarlyClose: value } })}
                />
                <Checkbox
                  label="Allow renewal"
                  checked={editor.draft.allowRenewal}
                  onChange={(value) => setEditor({ ...editor, draft: { ...editor.draft, allowRenewal: value } })}
                />
                <Checkbox
                  label="Auto-close at period end"
                  checked={editor.draft.autoClose}
                  onChange={(value) => setEditor({ ...editor, draft: { ...editor.draft, autoClose: value } })}
                />
                <Checkbox
                  label="Active"
                  checked={editor.draft.isActive}
                  onChange={(value) => setEditor({ ...editor, draft: { ...editor.draft, isActive: value } })}
                />
              </div>
            </fieldset>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" type="button" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              <Button type="submit">Save plan</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
