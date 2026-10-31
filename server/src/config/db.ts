import mysql, { type Pool, type ResultSetHeader, type PoolConnection } from "mysql2/promise";
import { env } from "./env.js";

/**
 * Shared application pool. DECIMAL columns are returned as strings so money
 * never goes through binary floating point (see DATA_MODEL.md §6).
 */
export const pool: Pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  decimalNumbers: false,
  dateStrings: true,
  // Parameterized SQL only; never enable multipleStatements on this pool.
});

export type QueryResult<T extends mysql.RowDataPacket[] = mysql.RowDataPacket[]> = [T, unknown];

/** Simple SELECT helper returning typed rows. */
export async function query<T extends mysql.RowDataPacket[]>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(sql, params);
  return rows as unknown as T;
}

/** Simple INSERT/UPDATE/DELETE helper returning the result header. */
export async function execute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await pool.query<mysql.ResultSetHeader>(sql, params);
  return result as mysql.ResultSetHeader;
}

/** Runs async work inside one transaction; rolls back on any thrown error. */
export async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

/** Liveness probe used by the /health endpoint. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.execute("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
