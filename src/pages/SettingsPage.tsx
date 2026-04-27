import React from "react";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const panelClass = "border-2 border-[var(--pc-border)] bg-[var(--pc-panel)]";
const actionButtonClass =
  "inline-flex items-center justify-center border-2 border-[var(--pc-border)] px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] transition-colors";

const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6 text-[var(--pc-text)]">
      <section className={`${panelClass} p-5`}>
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--pc-text-muted)]">
          Power-Call // Settings
        </div>
        <h1 className="mt-2 text-3xl font-semibold">Operator Settings</h1>
        <p className="mt-1 text-sm text-[var(--pc-text-muted)]">
          Review identity details and manage your active session.
        </p>
      </section>

      <section className={`${panelClass} p-5`}>
        <div className="mb-4">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--pc-text-muted)]">
            Identity
          </div>
          <h2 className="mt-2 text-xl font-semibold">User Information</h2>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] p-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--pc-text-subtle)]">
              Username
            </div>
            <div className="mt-2 text-lg font-semibold">{user?.username || "Guest"}</div>
          </div>

          <div className="border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] p-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--pc-text-subtle)]">
              Email
            </div>
            <div className="mt-2 text-lg font-semibold">{user?.email || "Not available"}</div>
          </div>

          <div className="border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] p-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--pc-text-subtle)]">
              User UUID
            </div>
            <div className="mt-2 break-all text-sm text-[var(--pc-text-muted)]">{user?.user_id || "N/A"}</div>
          </div>

          <div className="border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] p-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--pc-text-subtle)]">
              Session
            </div>
            <div className="mt-2 text-sm text-[var(--pc-text-muted)]">
              Your current Power-Call session is active in this browser.
            </div>
          </div>
        </div>
      </section>

      <section className={`${panelClass} p-5`}>
        <div className="mb-4">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--pc-text-muted)]">
            Display
          </div>
          <h2 className="mt-2 text-xl font-semibold">Theme Mode</h2>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`${actionButtonClass} ${
              theme === "dark"
                ? "bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] hover:bg-[var(--pc-action-inverse-hover)]"
                : "bg-[var(--pc-action-bg)] text-[var(--pc-action-text)] hover:bg-[var(--pc-action-hover)]"
            }`}
          >
            Mono Dark
          </button>
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`${actionButtonClass} ${
              theme === "light"
                ? "bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] hover:bg-[var(--pc-action-inverse-hover)]"
                : "bg-[var(--pc-action-bg)] text-[var(--pc-action-text)] hover:bg-[var(--pc-action-hover)]"
            }`}
          >
            Light
          </button>
        </div>
      </section>

      <section className={`${panelClass} p-5`}>
        <div className="mb-4">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--pc-text-muted)]">
            Access
          </div>
          <h2 className="mt-2 text-xl font-semibold">Session Controls</h2>
        </div>

        <button
          type="button"
          onClick={logout}
          className={`${actionButtonClass} bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] hover:bg-[var(--pc-action-inverse-hover)]`}
        >
          Sign Out
        </button>
      </section>
    </div>
  );
};

export default SettingsPage;
