import React, { createContext, useContext, useEffect, useState } from "react";
import { getToken, saveToken, removeToken } from "../adapters/token-adapter";
import { getMe } from "../services/api";
import { User } from "../types";

interface AuthContextType {
  token: string | null;
  user: User | null;
  setToken: (token: string | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrateUser = async (storedToken: string) => {
    try {
      const me = await getMe(storedToken);
      setUser(me);
    } catch (error) {
      console.error("Failed to hydrate current user:", error);
      await removeToken();
      setTokenState(null);
      setUser(null);
    }
  };

  useEffect(() => {
    const loadTokenAndUser = async () => {
      const storedToken = await getToken();
      setTokenState(storedToken);

      if (storedToken) {
        await hydrateUser(storedToken);
      }

      setLoading(false);
    };

    loadTokenAndUser();
  }, []);

  const setToken = async (newToken: string | null) => {
    setTokenState(newToken);
    if (newToken) {
      await saveToken(newToken);
      await hydrateUser(newToken);
    } else {
      await removeToken();
      setUser(null);
    }
  };

  const logout = () => {
    setToken(null);
    removeToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, setToken, logout }}>
      {!loading ? children : (
        <div className="flex h-screen items-center justify-center bg-[var(--pc-bg)] px-4 text-[var(--pc-text)]">
          <div className="w-full max-w-lg border-2 border-[var(--pc-border)] bg-[var(--pc-panel)] p-8 text-center">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--pc-text-muted)]">
              Power-Call // Session
            </div>
            <h1 className="mt-4 text-2xl font-semibold">Restoring operator state</h1>
            <p className="mt-2 text-sm text-[var(--pc-text-muted)]">
              Rehydrating token and identity for the current client session.
            </p>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
