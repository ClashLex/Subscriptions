import * as argon2 from "argon2";
import { z } from "zod";

/**
 * Password policy from REQUIREMENTS.md §2.1: more than eight characters with
 * at least one uppercase letter, one lowercase letter, and one special character.
 */
export const passwordPolicySchema = z
  .string()
  .min(1, "Password is required.")
  .superRefine((value, ctx) => {
    if (value.length <= 8) {
      ctx.addIssue({
        code: "custom",
        message: "Password must be longer than 8 characters.",
      });
    }
    if (!/[A-Z]/.test(value)) {
      ctx.addIssue({ code: "custom", message: "Password must contain an uppercase letter." });
    }
    if (!/[a-z]/.test(value)) {
      ctx.addIssue({ code: "custom", message: "Password must contain a lowercase letter." });
    }
    if (!/[^\p{L}\p{N}\s]/u.test(value)) {
      ctx.addIssue({ code: "custom", message: "Password must contain a special character." });
    }
  });

/** Hash with Argon2id (SECURITY_AND_ACCESS.md §2). */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
