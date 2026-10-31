import { env } from "../src/config/env.js";
import { hashPassword, verifyPassword, passwordPolicySchema } from "../src/lib/passwords.js";
import { findUserByEmail } from "../src/modules/auth/auth.repository.js";
import { toPublicUser } from "../src/modules/auth/auth.repository.js";
import { execute } from "../src/config/db.js";

/**
 * Deterministic demo seed: creates (or syncs) one Admin account.
 * Idempotent — safe to run repeatedly. Values come from the root .env.
 */
async function main(): Promise<void> {
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    // eslint-disable-next-line no-console
    console.log("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — nothing to seed.");
    return;
  }
  passwordPolicySchema.parse(env.SEED_ADMIN_PASSWORD);
  const email = env.SEED_ADMIN_EMAIL;
  const existing = await findUserByEmail(email);

  if (!existing) {
    const passwordHash = await hashPassword(env.SEED_ADMIN_PASSWORD);
    await execute("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'ADMIN')", [
      email,
      passwordHash,
    ]);
    // eslint-disable-next-line no-console
    console.log(`Seeded Admin: ${email}`);
    return;
  }

  if (existing.role !== "ADMIN") {
    // eslint-disable-next-line no-console
    console.error(`Refusing to seed: ${email} exists as ${existing.role}.`);
    process.exit(1);
  }

  const passwordUnchanged = await verifyPassword(
    existing.password_hash,
    env.SEED_ADMIN_PASSWORD,
  ).catch(() => false);
  if (!passwordUnchanged) {
    await execute("UPDATE users SET password_hash = ? WHERE id = ?", [
      await hashPassword(env.SEED_ADMIN_PASSWORD),
      existing.id,
    ]);
    // eslint-disable-next-line no-console
    console.log(`Seeded Admin password refreshed: ${email}`);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`Admin already seeded: ${toPublicUser(existing).email}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
