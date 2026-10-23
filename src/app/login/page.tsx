"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppHeader } from "@/components/app-header";

function safeNext(value: string | null, fallback: string) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const as = params.get("as") === "admin" ? "admin" : "driver";
  const next = safeNext(params.get("next"), as === "admin" ? "/dispatch" : "/driver");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, as }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sign in failed");
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="sb-rise space-y-4">
      <h1 className="sb-brand text-3xl">{as === "admin" ? "Admin" : "Driver"}</h1>

      <label className="block space-y-1.5">
        <span className="sb-label">Password</span>
        <div className="relative">
          <input
            className="sb-input pr-16"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="absolute top-1/2 right-3 -translate-y-1/2 px-1 text-sm font-semibold text-ink-soft"
            onClick={() => setShow((s) => !s)}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      <button
        type="submit"
        className="sb-btn sb-btn-primary sb-btn-lg w-full"
        disabled={busy || !password}
      >
        {busy ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="sb-shell">
      <AppHeader />
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-foam" />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
