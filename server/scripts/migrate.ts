import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { env } from "../src/config/env.js";

/**
 * Ordered, one-shot migration runner (see DATA_MODEL.md §7).
 * Each file runs once; applied filenames are recorded in `schema_migrations`.
 * A second dedicated connection enables multipleStatements because trusted
 * migration files may contain several statements; the application pool itself
 * keeps parameterized single statements only.
 */
async function main(): Promise<void> {
  const migrationsDir = path.resolve(process.cwd(), "migrations");

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) {
    // eslint-disable-next-line no-console
    console.log("No migration files found.");
    return;
  }

  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    multipleStatements: true,
  });

  try {
    await connection.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename   VARCHAR(255) NOT NULL,
         applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (filename)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    const [appliedRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT filename FROM schema_migrations",
    );
    const applied = new Set(appliedRows.map((row) => String(row.filename)));

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) continue;

      // eslint-disable-next-line no-console
      console.log(`Applying ${file} …`);
      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await connection.query(sql);
      await connection.query("INSERT INTO schema_migrations (filename) VALUES (?)", [file]);
      appliedCount += 1;
    }

    // eslint-disable-next-line no-console
    console.log(
      appliedCount === 0
        ? "Schema is up to date."
        : `Schema is up to date (${appliedCount} migration(s) applied).`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
