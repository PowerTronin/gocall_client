import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Lock, User } from "lucide-react";

import { APP_NAME, APP_VERSION } from "../app-meta";
import logoBlue from "../assets/logos/pt-logo-fin-blue.svg";
import logoWhite from "../assets/logos/pt-logo-fin-white.svg";
import { TypingEffect } from "../components/TypingEffect/TypingEffect";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { login, register } from "../services/api";

const shellPanelClass = "border-2 border-[var(--pc-border)] bg-[var(--pc-panel)]";
const inputClass =
  "w-full border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] px-4 py-3 text-sm text-[var(--pc-text)] outline-none placeholder:text-[var(--pc-text-subtle)]";
const themeButtonClass =
  "inline-flex items-center justify-center border-2 border-[var(--pc-border)] px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] transition-colors";

const LoginSignupPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const { setToken } = useAuth();
  const { theme, setTheme } = useTheme();
  const currentLogo = theme === "light" ? logoBlue : logoWhite;

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError("");
    setSuccessMessage("");
  };

  const switchToLoginMode = () => {
    setIsLogin(true);
    setError("");
  };

  const handleSubmit = async () => {
    try {
      setError("");
      setSuccessMessage("");

      if (!isLogin) {
        if (username.length < 3) {
          setError("Username must be at least 3 characters");
          return;
        }
        if (username.length > 32) {
          setError("Username must be at most 32 characters");
          return;
        }
        if (password.length < 6) {
          setError("Password must be at least 6 characters");
          return;
        }
      }

      if (isLogin) {
        const token = await login(username, password);
        await setToken(token);
        window.location.href = "/home";
      } else {
        await register(username, password);
        setSuccessMessage("Registration successful! You can now log in.");
        switchToLoginMode();
      }
    } catch (err: any) {
      setError(err.message || "Operation failed");
    }
  };

  const formVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  };

  return (
    <div className="min-h-screen bg-[var(--pc-bg)] px-4 py-6 text-[var(--pc-text)] lg:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1380px] flex-col gap-4 lg:flex-row">
        <section className={`flex w-full flex-col justify-between p-6 lg:w-[46%] lg:p-10 ${shellPanelClass}`}>
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="-mt-2 flex h-14 w-14 items-center justify-center">
                  <img src={currentLogo} alt={`${APP_NAME} logo`} className="h-full w-full object-contain" />
                </div>
                <div className="min-w-0 pt-[2px]">
                  <div className="whitespace-nowrap text-[26px] leading-none">{APP_NAME}</div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--pc-text-muted)]">
                    version: {APP_VERSION}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`${themeButtonClass} ${
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
                  className={`${themeButtonClass} ${
                    theme === "light"
                      ? "bg-[var(--pc-action-inverse-bg)] text-[var(--pc-action-inverse-text)] hover:bg-[var(--pc-action-inverse-hover)]"
                      : "bg-[var(--pc-action-bg)] text-[var(--pc-action-text)] hover:bg-[var(--pc-action-hover)]"
                  }`}
                >
                  Light
                </button>
              </div>
            </div>

            <div className="mt-10 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--pc-text-muted)]">
              Operator Access
            </div>
            <h1 className="mt-3 text-4xl font-semibold leading-tight lg:text-5xl">
              {isLogin ? "Reconnect to the network." : "Create a new operator profile."}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--pc-text-muted)]">
              Power-Call keeps rooms, direct links, and voice controls in one system shell.
              Sign in to resume session flow or create an account to initialize a new one.
            </p>
          </div>

          <div className="mt-12">
            <div className="text-2xl font-semibold text-[var(--pc-text)]">
              <TypingEffect
                init="Power-Call is"
                words={["fast", "secure", "private", "direct", "voice-first"]}
              />
            </div>
          </div>
        </section>

        <section className={`w-full p-6 lg:w-[54%] lg:p-10 ${shellPanelClass}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={isLogin ? "login" : "signup"}
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={formVariants}
              transition={{ duration: 0.22 }}
              className="mx-auto flex h-full max-w-xl flex-col justify-center"
            >
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--pc-text-muted)]">
                {isLogin ? "Session Entry" : "Registration"}
              </div>
              <h2 className="mt-3 text-3xl font-semibold lg:text-4xl">
                {isLogin ? "Welcome back" : "Create an account"}
              </h2>
              <p className="mt-2 text-sm text-[var(--pc-text-soft)]">
                {isLogin
                  ? "Use your operator credentials to restore the active session."
                  : "Register a new identity for rooms, messages, and private voice."}
              </p>

              <div className="mt-8 space-y-4">
                <InputField
                  icon={User}
                  placeholder="Username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleSubmit();
                    }
                  }}
                />
                <InputField
                  icon={Lock}
                  placeholder="Password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleSubmit();
                    }
                  }}
                />
              </div>

              {error && <p className="mt-4 text-sm text-[var(--pc-text)]">{error}</p>}
              {successMessage && <p className="mt-4 text-sm text-[var(--pc-text-muted)]">{successMessage}</p>}

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  className="inline-flex items-center justify-center gap-2 border-2 border-[var(--pc-border)] bg-[var(--pc-action-inverse-bg)] px-6 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--pc-action-inverse-text)] transition-colors hover:bg-[var(--pc-action-inverse-hover)]"
                >
                  {isLogin ? "Sign In" : "Sign Up"}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleMode}
                  className="inline-flex items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] px-6 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--pc-text)] transition-colors hover:bg-[var(--pc-surface-strong)]"
                >
                  {isLogin ? "Create Account" : "Back to Login"}
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
};

const InputField = ({
  icon: Icon,
  placeholder,
  type,
  value,
  onChange,
  onKeyDown,
}: {
  icon: React.ElementType;
  placeholder: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) => (
  <div className="flex items-center gap-3">
    <div className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-[var(--pc-border)] bg-[var(--pc-bg)] text-[var(--pc-text-muted)]">
      <Icon className="h-4 w-4" />
    </div>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      className={inputClass}
    />
  </div>
);

export default LoginSignupPage;
