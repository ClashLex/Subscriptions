import { z } from "zod";
import { passwordPolicySchema } from "../../lib/passwords.js";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, "Enter a valid email address.")
  .max(254, "Enter a valid email address.")
  .email("Enter a valid email address.");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordPolicySchema,
  displayName: z.string().trim().min(1).max(255).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "The reset link is invalid or has expired."),
  password: passwordPolicySchema,
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
