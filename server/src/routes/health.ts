import { Router } from "express";
import { pingDatabase } from "../config/db.js";

export const healthRouter = Router();

/**
 * GET /api/v1/health — liveness/readiness without secrets (API_CONTRACT.md §3).
 * Returns 200 only when the database responds; 503 otherwise.
 */
healthRouter.get("/health", async (_req, res) => {
  const database = await pingDatabase();
  res.status(database ? 200 : 503).json({
    data: {
      status: database ? "ready" : "degraded",
      checks: { database },
    },
  });
});
