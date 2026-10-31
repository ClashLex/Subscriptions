import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { request } from "../lib/api.js";
import type { SessionUser } from "../lib/types.js";

type SessionStatus = "loading" | "anon" | "authed";

interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  /** True only for ADMIN (Staff must see the screens read-only). */
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUserState] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await request<{ user: SessionUser }>("/auth/me");
        if (!cancelled) {
          setUserState(data.user);
          setStatus("authed");
        }
      } catch {
        if (!cancelled) {
          setStatus("anon");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user,
      isAdmin: user?.role === "ADMIN",
      async login(email, password) {
        const data = await request<{ user: SessionUser }>("/auth/login", {
          method: "POST",
          body: { email, password },
        });
        setUserState(data.user);
        setStatus("authed");
        return data.user;
      },
      async logout() {
        try {
          await request("/auth/logout", { method: "POST" });
        } finally {
          setUserState(null);
          setStatus("anon");
        }
      },
    }),
    [status, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside <SessionProvider>.");
  }
  return context;
}
