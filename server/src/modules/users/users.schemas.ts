import { z } from "zod";
import { passwordPolicySchema } from "../../lib/passwords.js";

export const staffCreateSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(5)
    .max(254)
    .email("Enter a valid email address."),
  password: passwordPolicySchema,
  displayName: z.string().trim().min(1, "Display name is required.").max(255),
});

export const userStatusSchema = z.object({
  isActive: z.boolean(),
});
