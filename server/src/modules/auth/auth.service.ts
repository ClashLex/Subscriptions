import { AppError } from "../../middleware/errors.js";
import { hashPassword, verifyPassword } from "../../lib/passwords.js";
import {
  generateResetToken,
  hashToken,
  sendPasswordResetEmail,
} from "../../lib/email.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordDto,
  type LoginDto,
  type RegisterDto,
  type ResetPasswordDto,
} from "./auth.schemas.js";
import {
  completePasswordReset,
  createPasswordResetToken,
  createUser,
  findUsableResetToken,
  findUserByEmail,
  findUserById,
  toPublicUser,
  type PublicUser,
} from "./auth.repository.js";

const TOKEN_MINUTES = 60;

function duplicateOrNull(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: string }).code === "ER_DUP_ENTRY";
}

/** Customer registration: unique normalized email, policy-checked password. */
export async function register(dto: RegisterDto): Promise<PublicUser> {
  registerSchema.parse(dto);
  const existing = await findUserByEmail(dto.email);
  if (existing) {
    throw new AppError(409, "EMAIL_TAKEN", "An account with that email already exists.");
  }
  try {
    const passwordHash = await hashPassword(dto.password);
    const userId = await createUser({
      email: dto.email,
      passwordHash,
      role: "CUSTOMER",
      displayName: dto.displayName,
    });
    const user = await findUserById(userId);
    if (!user) {
      throw new AppError(500, "INTERNAL_ERROR", "Registration failed unexpectedly.");
    }
    return toPublicUser(user);
  } catch (error) {
    if (duplicateOrNull(error)) {
      throw new AppError(409, "EMAIL_TAKEN", "An account with that email already exists.");
    }
    throw error;
  }
}

/** Login: generic failures never reveal which check failed. */
export async function login(dto: LoginDto): Promise<PublicUser> {
  loginSchema.parse(dto);
  const user = await findUserByEmail(dto.email);
  if (!user) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  const valid = await verifyPassword(user.password_hash, dto.password);
  if (!valid || user.is_active === 0) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  return toPublicUser(user);
}

export interface ForgotPasswordResult {
  message: string;
  devUrl?: string;
}

/**
 * Same generic response whether or not the email exists (no account
 * enumeration). Real email needs SMTP; without it the link is only logged in
 * development (documented development fallback, REQUIREMENTS.md §4).
 */
export async function forgotPassword(dto: ForgotPasswordDto): Promise<ForgotPasswordResult> {
  forgotPasswordSchema.parse(dto);
  const user = await findUserByEmail(dto.email);
  let devUrl: string | undefined;

  if (user && user.is_active === 1) {
    const rawToken = generateResetToken();
    await createPasswordResetToken(user.id, hashToken(rawToken), TOKEN_MINUTES);
    const delivery = await sendPasswordResetEmail(user.email, rawToken);
    devUrl = delivery.devUrl;
  }

  return {
    message: "If an account exists for that email, a reset link has been sent.",
    ...(devUrl ? { devUrl } : {}),
  };
}

/** Validates the one-time token and applies the new password atomically. */
export async function resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
  resetPasswordSchema.parse(dto);
  const token = await findUsableResetToken(hashToken(dto.token));
  if (!token) {
    throw new AppError(400, "INVALID_RESET_TOKEN", "Reset link is invalid or has expired.");
  }
  if (token.is_active === 0) {
    throw new AppError(403, "ACCOUNT_DISABLED", "This account is deactivated.");
  }
  const passwordHash = await hashPassword(dto.password);
  await completePasswordReset(token.id, token.user_id, passwordHash);
  return { message: "Password updated. You can sign in with your new password." };
}
