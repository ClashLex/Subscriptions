import { RowDataPacket } from "mysql2/promise";
import { AppError } from "../../middleware/errors.js";
import { hashPassword } from "../../lib/passwords.js";
import { query, withTransaction } from "../../config/db.js";
import { createUser, findUserByEmail, revokeUserSessionsWithConnection } from "../auth/auth.repository.js";
import type { z } from "zod";
import type { staffCreateSchema } from "./users.schemas.js";

export interface UserListRow extends RowDataPacket {
  id: number;
  email: string;
  role: "ADMIN" | "STAFF" | "CUSTOMER";
  is_active: 0 | 1;
  created_at: string;
}

/** Admin list view (server-side pagination with the API-contract metadata). */
export async function listUsers(limit = 25, offset = 0): Promise<{ rows: UserListRow[]; total: number }> {
  const rows = await query<UserListRow[]>(
    `SELECT id, email, role, is_active, created_at
     FROM users ORDER BY id LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  const countRows = await query<Array<RowDataPacket & { total: number }>>(
    "SELECT COUNT(*) AS total FROM users",
  );
  return { rows, total: Number(countRows[0]?.total ?? 0) };
}

export interface CustomerOptionRow {
  id: number;
  email: string;
  displayName: string | null;
  companyName: string | null;
  isActive: boolean;
}

interface CustomerQueryRow extends RowDataPacket {
  id: number;
  email: string;
  display_name: string | null;
  company_name: string | null;
  is_active: 0 | 1;
}

/**
 * Minimal customer directory for staff tooling (subscription creation,
 * filtering). Ids, contact names, and active flags only — no profile data.
 * Added as a contract extension so Staff can fulfil their documented
 * "Customers" navigation duty.
 */
export async function listCustomerOptions(): Promise<CustomerOptionRow[]> {
  const rows = await query<CustomerQueryRow[]>(
    `SELECT u.id, u.email, p.display_name, p.company_name, u.is_active
     FROM users u LEFT JOIN customer_profiles p ON p.user_id = u.id
     WHERE u.role = 'CUSTOMER' ORDER BY u.id`,
  );
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    companyName: row.company_name,
    isActive: row.is_active === 1,
  }));
}

/** Only Admin can add a staff member (REQUIREMENTS.md §2.1). */
export async function createStaff(
  dto: z.infer<typeof staffCreateSchema>,
): Promise<{ id: number; email: string; role: "STAFF" }> {
  const existing = await findUserByEmail(dto.email);
  if (existing) {
    throw new AppError(409, "EMAIL_TAKEN", "An account with that email already exists.");
  }
  try {
    const passwordHash = await hashPassword(dto.password);
    const userId = await createUser({
      email: dto.email,
      passwordHash,
      role: "STAFF",
      displayName: dto.displayName,
    });
    return { id: userId, email: dto.email, role: "STAFF" };
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "ER_DUP_ENTRY") {
      throw new AppError(409, "EMAIL_TAKEN", "An account with that email already exists.");
    }
    throw error;
  }
}

export interface SetStatusResult {
  id: number;
  isActive: boolean;
}

/**
 * Status change with session revocation: a deactivated account loses access
 * immediately, not at its cookie's next expiry (SECURITY_AND_ACCESS.md §3).
 */
export async function setAccountStatus(
  actorId: number,
  targetId: number,
  isActive: boolean,
): Promise<SetStatusResult> {
  if (!Number.isInteger(targetId) || targetId <= 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid user id.");
  }
  if (targetId === actorId) {
    throw new AppError(400, "VALIDATION_ERROR", "Admins cannot change their own status.");
  }
  const rows = await query<UserListRow[]>(
    "SELECT id, email, role, is_active, created_at FROM users WHERE id = ? LIMIT 1",
    [targetId],
  );
  const target = rows[0];
  if (!target) {
    throw new AppError(404, "NOT_FOUND", "User not found.");
  }

  await withTransaction(async (connection) => {
    await connection.execute("UPDATE users SET is_active = ? WHERE id = ?", [
      isActive ? 1 : 0,
      targetId,
    ]);
    if (!isActive) {
      await revokeUserSessionsWithConnection(connection, targetId);
    }
    await connection.execute(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, 'user_status_change', 'users', ?, JSON_OBJECT('isActive', ?))`,
      [actorId, targetId, isActive],
    );
  });
  return { id: targetId, isActive };
}
