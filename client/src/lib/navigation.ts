import type { Role } from "./types.js";

export function homeFor(role: Role | undefined): string {
  return role === "CUSTOMER" ? "/portal" : "/admin";
}

export function loginDestination(role: Role, search: string): string {
  const next = new URLSearchParams(search).get("next");
  return next !== null && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
    ? next : homeFor(role);
}
