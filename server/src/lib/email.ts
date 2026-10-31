import { createHash, randomBytes } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";

let cachedTransport: Transporter | null = null;

function getTransport(): Transporter | null {
  if (!env.SMTP_HOST) {
    return null; // development fallback: link is logged, not delivered
  }
  if (cachedTransport) {
    return cachedTransport;
  }
  cachedTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER && env.SMTP_PASSWORD
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
  });
  return cachedTransport;
}

/** Raw one-time token; only its sha256 hash is ever stored. */
export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface SendResetResult {
  delivered: boolean;
  /** Present only for the local development fallback (never in production). */
  devUrl?: string;
}

export async function sendPasswordResetEmail(to: string, rawToken: string): Promise<SendResetResult> {
  const resetUrl = `${env.APP_URL}/reset-password?token=${rawToken}`;
  const transport = getTransport();

  if (!transport) {
    // eslint-disable-next-line no-console
    console.error(`[email:dev-fallback] Password reset link for ${to}: ${resetUrl}`);
    return {
      delivered: false,
      ...(env.NODE_ENV === "development" ? { devUrl: resetUrl } : {}),
    };
  }

  await transport.sendMail({
    from: env.MAIL_FROM ?? "no-reply@subscriptions.local",
    to,
    subject: "Subscriptions — Password reset",
    text: "A password reset was requested for your account.\n\n"
      + `Open this one-time link to set a new password (valid for 60 minutes):\n${resetUrl}\n\n`
      + "If you did not request this, you can ignore this email.",
    html: `<p>A password reset was requested for your account.</p>`
      + `<p><a href="${resetUrl}">Set a new password</a> (one-time link, valid for 60 minutes).</p>`
      + `<p>If you did not request this, you can ignore this email.</p>`,
  });

  return { delivered: true };
}

/** Sends an issued invoice link. No development fallback sends or logs customer invoice data. */
export async function sendInvoiceEmail(input: {
  to: string;
  invoiceId: number;
  invoiceNumber: string;
  currencyCode: string;
  grandTotal: string;
  dueDate: string;
  status: "CONFIRMED" | "PAID";
}): Promise<boolean> {
  const transport = getTransport();
  if (!transport) return false;
  const link = new URL(`/portal?tab=invoices&open=${input.invoiceId}`, env.APP_URL).toString();
  await transport.sendMail({
    from: env.MAIL_FROM ?? "no-reply@subscriptions.local",
    to: input.to,
    subject: `Invoice ${input.invoiceNumber} — Subscriptions`,
    text: `Invoice ${input.invoiceNumber} is available in your Subscriptions portal.\n\n`
      + `Status: ${input.status}\nTotal: ${input.currencyCode} ${input.grandTotal}\nDue date: ${input.dueDate}\n\n`
      + `View and print your invoice after signing in: ${link}\n`,
  });
  return true;
}
