"use client";

import { FormEvent, useMemo, useState } from "react";

export default function LoginPage() {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextPath = useMemo(() => {
    if (typeof window === "undefined") return "/";
    const next = new URLSearchParams(window.location.search).get("next");
    return next && next.startsWith("/") ? next : "/";
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, pass, next: nextPath }),
    });

    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; next?: string }
      | null;

    if (!res.ok || !json?.ok) {
      setError(json?.error || "Login fehlgeschlagen");
      setLoading(false);
      return;
    }

    window.location.href = json.next || "/";
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-6">
        <div className="glass-card w-full p-6 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Geschuetzter Bereich
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Spotify Trend Radar Login</h1>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted-foreground">Benutzername</span>
              <input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                required
                className="h-11 w-full rounded-xl border border-glass-border bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted-foreground">Passwort</span>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                required
                className="h-11 w-full rounded-xl border border-glass-border bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              />
            </label>

            {error ? (
              <p className="rounded-xl border border-score-high/40 bg-score-high/10 px-3 py-2 text-sm text-score-high">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Pruefe..." : "Einloggen"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

