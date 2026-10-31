import dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// Locate the shared root `.env` regardless of whether the process runs from
// `server/` or the repository root (compose.yaml reads the same file).
for (const relative of ["../.env", "../../.env", ".env"]) {
  const candidate = path.resolve(process.cwd(), relative);
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

/**
 * Fail-fast environment validation. The server must not start with missing
 * or malformed configuration (see REQUIREMENTS.md acceptance discipline).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default("http://localhost:5173"),
  API_URL: z.string().url().default("http://localhost:4000"),

  // Global API rate-limit ceiling per 5-minute window. The default is a sane
  // production value; demo/report environments raise it via .env because
  // acceptance suites issue hundreds of requests in quick succession.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  // Automatic billing run interval in minutes. Unset/0 keeps the scheduler off
  // and billing runs only through the Admin-only manual trigger.
  BILLING_RUN_INTERVAL_MINUTES: z.coerce.number().int().min(0).optional(),

  DB_HOST: z.string().min(1, "DB_HOST is required"),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().min(1, "DB_NAME is required"),
  DB_USER: z.string().min(1, "DB_USER is required"),
  DB_PASSWORD: z.string().min(1, "DB_PASSWORD is required"),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters (use: openssl rand -base64 48)"),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  // Demo seed only (scripts/seed.ts); optional.
  SEED_ADMIN_EMAIL: z.string().trim().toLowerCase().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === "production") {
    if (value.DB_PASSWORD === "replace_me") {
      ctx.addIssue({ code: "custom", message: "DB_PASSWORD must be changed from the example value in production" });
    }
    if (value.SESSION_SECRET.includes("replace")) {
      ctx.addIssue({ code: "custom", message: "SESSION_SECRET must be a real secret in production" });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

// Empty strings (e.g. unset SMTP_* lines in .env) are treated as absent.
const rawInput: Record<string, unknown> = { ...process.env };
for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"]) {
  if (rawInput[key] === "") delete rawInput[key];
}

const parsed = envSchema.safeParse(rawInput);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
