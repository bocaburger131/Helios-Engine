"use client";

import { useCallback, useEffect, useState } from "react";
import {
  API_BASE,
  DASHBOARD_BASE,
  getStoredToken,
  setStoredToken,
  TOKEN_STORAGE_KEY,
} from "@/lib/apiClient";
import { fetchAuthStatus } from "@/lib/batchUploadClient";

function isValidJwt(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

export default function AuthSecurityPanel() {
  const [authDisabled, setAuthDisabled] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    fetchAuthStatus()
      .then((s) => setAuthDisabled(s.authDisabled))
      .catch(() => setAuthDisabled(false));
    const stored = getStoredToken();
    if (stored) setToken(stored);
  }, []);

  const saveToken = useCallback(() => {
    const trimmed = token.trim();
    if (trimmed) setStoredToken(trimmed);
    else if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }, [token]);

  const handleLogin = useCallback(async () => {
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.token) {
        throw new Error(json.error || json.message || "Login failed");
      }
      setToken(json.token);
      setStoredToken(json.token);
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoggingIn(false);
    }
  }, [loginEmail, loginPassword]);

  const tokenValid = token.trim() ? isValidJwt(token.trim()) : false;

  return (
    <div className="space-y-3 border-t border-white/10 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Auth & security
        </p>
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          {showGuide ? "Hide guide" : "Guide"}
        </button>
      </div>

      {authDisabled === true && (
        <span className="helios-chip bg-emerald-900/40 text-emerald-300">
          Auth disabled (demo)
        </span>
      )}
      {authDisabled === false && (
        <span className="helios-chip bg-amber-900/30 text-amber-200">
          JWT required
        </span>
      )}

      {authDisabled === false && (
        <div className="space-y-2">
          <input
            type="email"
            placeholder="Email"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-slate-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-slate-500"
          />
          <button
            type="button"
            disabled={loggingIn}
            onClick={handleLogin}
            className="helios-btn helios-btn-primary w-full py-1.5 text-xs"
          >
            {loggingIn ? "Signing in…" : "Sign in"}
          </button>
          {loginError && (
            <p className="text-xs text-rose-400">{loginError}</p>
          )}
        </div>
      )}

      <label className="block text-xs text-slate-400">
        JWT token
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onBlur={saveToken}
          placeholder="bsaDashboardToken"
          className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-xs text-white placeholder:text-slate-500"
        />
      </label>
      {token.trim() && (
        <p className={`text-xs ${tokenValid ? "text-emerald-400" : "text-rose-400"}`}>
          {tokenValid ? "Valid JWT format" : "Invalid JWT format"}
        </p>
      )}

      {showGuide && (
        <div className="space-y-2 rounded-md bg-white/5 p-2 text-xs text-slate-400">
          <p>
            <strong className="text-slate-300">Demo:</strong> Set{" "}
            <code className="text-blue-300">DISABLE_AUTH=true</code> on the API.
          </p>
          <p>
            <strong className="text-slate-300">JWT:</strong> Login or paste token
            — stored as <code className="text-blue-300">bsaDashboardToken</code>.
          </p>
          <p>
            <strong className="text-slate-300">API:</strong> {API_BASE}
          </p>
          <p>
            <strong className="text-slate-300">Dashboard:</strong> {DASHBOARD_BASE}
          </p>
          <p>
            Legacy HTML:{" "}
            <code className="text-blue-300">
              localStorage.bsaDashboardBaseUrl = &apos;legacy&apos;
            </code>
          </p>
        </div>
      )}
    </div>
  );
}
