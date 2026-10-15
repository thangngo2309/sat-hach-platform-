"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  type AuthSession,
  type AuthUser,
  login as apiLogin,
  logout as apiLogout,
  refreshSession,
} from "@/lib/auth";

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Share an in-flight refresh request during development
// and when multiple components mount at the same time.
let pendingRefresh: Promise<AuthSession> | null = null;

function restoreAuthSession(): Promise<AuthSession> {
  if (!pendingRefresh) {
    pendingRefresh = refreshSession().finally(() => {
      pendingRefresh = null;
    });
  }

  return pendingRefresh;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const restoreSession = useCallback(async () => {
    try {
      const session = await restoreAuthSession();

      setUser(session.user);
      setAccessToken(session.accessToken);
    } catch {
      setUser(null);
      setAccessToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const signIn = async (username: string, password: string) => {
    const session = await apiLogin(username, password);

    setUser(session.user);
    setAccessToken(session.accessToken);
  };

  const signOut = async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
      setAccessToken(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
