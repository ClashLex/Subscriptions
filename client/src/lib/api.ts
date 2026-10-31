/**
 * Typed fetch wrapper for the versioned API. The server always answers with
 * an enveloped JSON body: { data } on success and { error } on failure
 * (API_CONTRACT.md §1). Cookies ride along because the dev proxy serves the
 * API on the same origin.
 */

export interface ValidationIssue {
  field: string;
  message: string;
}

export type ApiErrorDetails = ValidationIssue[];

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiErrorDetails;

  constructor(status: number, code: string, message: string, details?: ApiErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const EMPTY_PAGE: PageMeta = { page: 1, pageSize: 25, total: 0, totalPages: 1 };

interface Envelope {
  data?: unknown;
  meta?: PageMeta;
  error?: { code: string; message: string; details?: ApiErrorDetails };
}

export async function request<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const hasBody = init?.body !== undefined;
  const response = await fetch(`/api/v1${path}`, {
    method: init?.method ?? "GET",
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(init?.body) : undefined,
    credentials: "include",
  });

  let payload: Envelope | null = null;
  const text = await response.text();
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as Envelope;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error?.code ?? "REQUEST_FAILED",
      payload?.error?.message ?? "The request could not be completed.",
      payload?.error?.details,
    );
  }

  return (payload?.data ?? null) as T;
}

/** For pages: { data } alongside the pagination { meta }. */
export async function list<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ data: T[]; meta: PageMeta }> {
  const payload = await request<{ data: T[]; meta?: PageMeta }>(path, init);
  return { data: payload.data ?? [], meta: payload.meta ?? { ...EMPTY_PAGE } };
}

export function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Is the API running?");
}

/** Exact decimal strings are rendered as-is; no client-side float math. */
export function formatMoney(value: string): string {
  return `\u20B9${value}`;
}
