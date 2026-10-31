import { z } from "zod";

/**
 * Money is represented as exact decimal strings with at most two fraction
 * digits (DATA_MODEL.md §6, API_CONTRACT.md §1). Internally we convert to
 * BigInt minor units so arithmetic never touches binary floating point.
 */

const MONEY_PATTERN = /^-?\d+(\.\d{1,2})?$/;

export const moneySchema = z
  .string()
  .trim()
  .regex(MONEY_PATTERN, "Amounts must be decimal strings with at most 2 fraction digits (e.g. \"99.50\").");

export const nonNegativeMoneySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Amounts must not be negative and use at most 2 fraction digits (e.g. \"99.50\").");

const moneyRegex = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/** "123.45" → 12345n; "-0.10" → -10n */
export function toCents(value: string): bigint {
  const match = moneyRegex.exec(value);
  if (!match) {
    throw new Error(`Invalid money value: ${value}`);
  }
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2] ?? "0";
  const fraction = (match[3] ?? "00").padEnd(2, "0");
  return sign * (BigInt(whole) * 100n + BigInt(fraction));
}

/** 12345n → "123.45" */
export function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const digits = (negative ? -cents : cents).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function addMoney(...values: Array<string>): string {
  return fromCents(values.reduce((sum, value) => sum + toCents(value), 0n));
}

/** Percentage of a money string, rounded half-up at the cent boundary. */
export function percentOf(value: string, rate: string): string {
  const cents = toCents(value);
  const rateScaled = toCents(rate); // "18.00" → 1800n, meaning 18.00 %
  const numerator = cents * rateScaled; // scaled by RATE scale (2 dp) → value*rate*10^4
  // Divide by 10^4 with half-up rounding on magnitude.
  const quarter = numerator / 10000n;
  const remainder = numerator % 10000n;
  const sign = numerator < 0n ? -1n : 1n;
  const absRemainder = negativeZero(remainder);
  const rounded =
    remainder === 0n
      ? quarter
      : absRemainder * 5n >= 5000n
        ? quarter + sign
        : quarter;
  return fromCents(rounded);
}

function negativeZero(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/** max(a, b) over money strings. */
export function maxMoney(a: string, b: string): string {
  return toCents(a) >= toCents(b) ? a : b;
}
