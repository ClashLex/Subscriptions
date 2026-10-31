import { useEffect, useState } from "react";
import { list, request, type ApiError, asApiError } from "../lib/api.js";
import type { Plan, Product, TaxRule } from "../lib/types.js";
import { Badge, PageHeading } from "../ui/components.js";

interface CategoryCard {
  label: string;
  value: number;
  hint: string;
}

export function OverviewPage() {
  const [cards, setCards] = useState<CategoryCard[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [products, plans, taxes] = await Promise.all([
          list<Product>("/products?pageSize=1"),
          list<Plan>("/plans?pageSize=1"),
          request<TaxRule[]>("/taxes"),
        ]);
        if (!cancelled) {
          setCards([
            { label: "Active products", value: products.meta.total, hint: "Selling in the catalogue" },
            { label: "Plans", value: plans.meta.total, hint: "Available across role visibility" },
            { label: "Tax rules", value: taxes.length, hint: "Applied to billing runs" },
          ]);
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

  return (
    <div>
      <PageHeading
        title="Overview"
        subtitle="Catalogue setup is Phase 3; quotations, subscriptions, invoices, and payments land in later phases."
      />
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        {(cards ?? []).map((card) => (
          <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{card.value}</p>
            <p className="mt-0 text-xs text-slate-500">{card.hint}</p>
          </div>
        ))}
      </div>
      {!cards && !error ? <p className="text-sm text-slate-500">{"Loading counts\u2026"}</p> : null}
      <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <Badge tone="indigo">Demo seed</Badge>
        <span>
          The seeded Admin account is configured through the project environment
          (migration + seed scripts), not through this screen.
        </span>
      </div>
    </div>
  );
}
