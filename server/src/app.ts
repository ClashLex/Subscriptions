import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import session from "express-session";
import MySQLStoreFactory from "express-mysql-session";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { notFoundHandler, errorHandler } from "./middleware/errors.js";

const MySQLStore = MySQLStoreFactory(session);

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(cors({ origin: env.APP_URL, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(
    rateLimit({
      windowMs: 5 * 60 * 1000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );

  // Server-side sessions persisted in MySQL; cookies are HttpOnly and
  // SameSite=Lax (see SECURITY_AND_ACCESS.md §3).
  const sessionStore = new MySQLStore({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    createDatabaseTable: true,
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
  });

  app.use(
    session({
      name: "subscriptions.sid",
      secret: env.SESSION_SECRET,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );

  app.use("/api/v1", healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
