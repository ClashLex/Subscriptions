import "express-session";

/**
 * What we persist inside the server-side session (MySQL store).
 * Only these two derived values are trusted; never trust a role supplied
 * in a request body (API_CONTRACT.md §7).
 */
declare module "express-session" {
  export interface SessionData {
    userId?: number;
    role?: "ADMIN" | "STAFF" | "CUSTOMER";
  }
}
