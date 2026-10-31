import type { PoolConnection } from "mysql2/promise";
import { RowDataPacket } from "mysql2/promise";
import { query, execute, withTransaction } from "../../config/db.js";

export type UserRole = "ADMIN" | "STAFF" | "CUSTOMER";

export interface UserRow extends RowDataPacket {
  id: number;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: 0 | 1;
}

export interface PublicUser {
  id: number;
  email: string;
  role: UserRole;
}

export function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, email: row.email, role: row.role };
}

/** Same as query() but typed for the tiny subsets of the users table. */
async function selectUser(email: string): Promise<UserRow | null> {
  const rows = await query<UserRow[]>(
    "SELECT id, email, password_hash, role, is_active FROM users WHERE email = ? LIMIT 1",
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return selectUser(email);
}

export async function findUserById(id: number): Promise<UserRow | null> {
  const rows = await query<UserRow[]>(
    "SELECT id, email, password_hash, role, is_active FROM users WHERE id = ? LIMIT 1",
    [id],
  );
  return rows[0] ?? null;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  role: UserRole;
  displayName?: string;
}

export async function createUser(input: CreateUserInput): Promise<number> {
  const result = await execute(
    "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
    [input.email, input.passwordHash, input.role],
  );
  const userId = Number(result.insertId);

  if (input.role === "CUSTOMER") {
    await execute("INSERT INTO customer_profiles (user_id, display_name) VALUES (?, ?)", [
      userId,
      input.displayName ?? null,
    ]);
  }
  return userId;
}

export async function createPasswordResetToken(
  userId: number,
  tokenHash: string,
  minutesValid: number,
): Promise<void> {
  await withTransaction(async (connection) => {
    // Invalidate the user's other outstanding one-time tokens.
    await connection.execute(
      "DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL",
      [userId],
    );
    await connection.execute(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE)`,
      [userId, tokenHash, minutesValid],
    );
  });
}

/**
 * Deletes every stored session whose JSON payload belongs to this user.
 * Used after password resets and account deactivation so invalidated users
 * cannot keep using an old cookie (SECURITY_AND_ACCESS.md §3, §4).
 */
export async function revokeUserSessionsWithConnection(
  connection: PoolConnection,
  userId: number,
): Promise<void> {
  const pattern = `%"userId":${userId},%`;
  const patternEnd = `%"userId":${userId}}%`;
  await connection.execute("DELETE FROM sessions WHERE data LIKE ? OR data LIKE ?", [
    pattern,
    patternEnd,
  ]);
}

export interface ResetTokenRow extends RowDataPacket {
  id: number;
  user_id: number;
  email: string;
  is_active: 0 | 1;
}

export async function findUsableResetToken(tokenHash: string): Promise<ResetTokenRow | null> {
  const rows = await query<ResetTokenRow[]>(
    `SELECT pt.id, pt.user_id, u.email, u.is_active
     FROM password_reset_tokens pt
     JOIN users u ON u.id = pt.user_id
     WHERE pt.token_hash = ? AND pt.used_at IS NULL AND pt.expires_at > UTC_TIMESTAMP()
     LIMIT 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

/**
 * Sets the new password, marks the token used, invalidates remaining unused
 * tokens, and revokes the user's existing sessions — all in one transaction
 * (SECURITY_AND_ACCESS.md §4).
 */
export async function completePasswordReset(
  tokenId: number,
  userId: number,
  passwordHash: string,
): Promise<void> {
  await withTransaction(async (connection) => {
    await connection.execute("UPDATE users SET password_hash = ? WHERE id = ?", [
      passwordHash,
      userId,
    ]);
    await connection.execute(
      "UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?",
      [tokenId],
    );
    await connection.execute(
      "DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL",
      [userId],
    );
    // Server-side sessions table rows embed the user id in their JSON payload.
    await revokeUserSessionsWithConnection(connection, userId);
  });
}

export async function updateUserActiveStatus(userId: number, isActive: boolean): Promise<void> {
  await execute("UPDATE users SET is_active = ? WHERE id = ?", [isActive ? 1 : 0, userId]);
}
