import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useEffect } from "react";
import { asApiError, type ApiError } from "../lib/api.js";

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "ui-button--primary",
  secondary: "ui-button--secondary",
  danger: "ui-button--danger",
  ghost: "ui-button--ghost",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`ui-button ${BUTTON_STYLES[variant]} ${className}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

const INPUT_CLASS = "ui-input";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="ui-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT_CLASS} ${className}`} />;
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${INPUT_CLASS} ${className}`} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${INPUT_CLASS} ${className}`} />;
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`ui-checkbox ${disabled ? "opacity-50" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded border-slate-300 accent-[#33705d] focus:ring-[#aee8c6]"
      />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

type BadgeTone = "green" | "slate" | "amber" | "red" | "indigo";

const BADGE_STYLES: Record<BadgeTone, string> = {
  green: "ui-badge--green",
  slate: "ui-badge--slate",
  amber: "ui-badge--amber",
  red: "ui-badge--red",
  indigo: "ui-badge--indigo",
};

export function Badge({ tone = "slate", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`ui-badge ${BADGE_STYLES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Renders a server error (message + optional per-field validation issues). */
export function ErrorBanner({ error }: { error: ApiError | null }) {
  if (!error) {
    return null;
  }
  return (
    <div className="ui-error" role="alert">
      <p className="font-medium">
        {error.code ? `${error.code}: ` : ""}
        {error.message}
      </p>
      {error.details !== undefined && error.details.length > 0 ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {error.details.map((issue) => (
            <li key={`${issue.field}-${issue.message}`}>
              <span className="font-semibold">{issue.field}</span>: {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Renders a thrown value in a banner (converts non-ApiError too). */
export function ErrorText({ error }: { error: unknown }) {
  if (error === null) {
    return null;
  }
  return <ErrorBanner error={asApiError(error)} />;
}

export function PageLoader({ label = "Loading\u2026" }: { label?: string }) {
  return (
    <div className="ui-loader">
      <span className="ui-loader__mark" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);
  if (!open) {
    return null;
  }
  return (
    <div className="ui-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className={`ui-modal ${wide ? "ui-modal--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ui-modal__heading">
          <h2>{title}</h2>
          <Button variant="ghost" aria-label="Close" onClick={onClose}>
            {"\u00D7"}
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table shell
// ---------------------------------------------------------------------------

export function TableShell({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="ui-table-shell">
      <div className="ui-table-scroll">
        <table className="ui-table">
          <thead>
            {head}
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function PageHeading({ title, subtitle, eyebrow = "Workspace" }: { title: string; subtitle?: string; eyebrow?: string }) {
  return (
    <div className="ui-page-heading">
      <p className="eyebrow"><span className="eyebrow__line" /> {eyebrow}</p>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}

export function Pagination({
  meta,
  onPage,
}: {
  meta: { page: number; totalPages: number; total: number } | null;
  onPage: (page: number) => void;
}) {
  if (!meta || meta.totalPages <= 1) {
    return null;
  }
  return (
    <div className="ui-pagination">
      <span>
        Page {meta.page} of {meta.totalPages} {"\u00B7"} {meta.total} item(s)
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
