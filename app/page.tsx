"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Calendar,
  ChevronDown,
  ExternalLink,
  Filter,
  Flame,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { supabase } from "../utils/supabase";

type Trend = {
  id: number | string;
  topic: string | null;
  category: string | null;
  relevance_score: number | null;
  summary: string | null;
  spotify_impact: string | null;
  url: string | null;
  published_date: string | null;
  week_number: number | null;
};

type GroupBy = "week" | "day" | "month";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function formatScore(score: number | null) {
  if (score === null || Number.isNaN(score)) return "—";
  const s = clamp01(score);
  return s.toFixed(2);
}

function scoreColor(score: number | null) {
  if (score === null || Number.isNaN(score)) return "text-zinc-500";
  const s = clamp01(score);
  if (s >= 0.8) return "text-emerald-400";
  if (s >= 0.6) return "text-lime-400";
  if (s >= 0.4) return "text-amber-400";
  return "text-rose-400";
}

function getISOWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Thursday in current week decides the year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNo;
}

function isThisMonth(isoDateString: string | null, now: Date) {
  if (!isoDateString) return false;
  const d = new Date(isoDateString);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoDayKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function safeDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function categoryStyles(category: string) {
  const key = category.toLowerCase();
  if (key.includes("spotify")) return "bg-[#1DB954]/15 text-[#1DB954] ring-[#1DB954]/25";
  if (key.includes("wettbewerb") || key.includes("competition"))
    return "bg-amber-500/15 text-amber-300 ring-amber-500/25";
  if (key.includes("lizenz") || key.includes("legal"))
    return "bg-violet-500/15 text-violet-300 ring-violet-500/25";
  if (key.includes("markt") || key.includes("marketing"))
    return "bg-sky-500/15 text-sky-300 ring-sky-500/25";
  return "bg-zinc-500/15 text-zinc-300 ring-zinc-500/25";
}

export default function Page() {
  const now = useMemo(() => new Date(), []);
  const currentWeek = useMemo(() => getISOWeek(new Date()), []);
  const lastWeek = useMemo(() => (currentWeek > 1 ? currentWeek - 1 : 52), [currentWeek]);

  const [groupBy, setGroupBy] = useState<GroupBy>("week");
  const [timeKey, setTimeKey] = useState<string>("all");
  const [minScore, setMinScore] = useState<number>(0.0);
  const [category, setCategory] = useState<string>("all");
  const [dataSourceUrl, setDataSourceUrl] = useState<string>("");

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);

  const normalizedTrends = useMemo(() => {
    // Filter out "empty" rows (common if ingestion partially failed).
    return trends
      .map((t) => {
        const d = safeDate(t.published_date);
        const computedWeek = t.week_number ?? (d ? getISOWeek(d) : null);
        return { ...t, week_number: computedWeek };
      })
      .filter((t) => {
        const hasTopic = Boolean((t.topic ?? "").trim());
        const hasSummary = Boolean((t.summary ?? "").trim());
        const hasImpact = Boolean((t.spotify_impact ?? "").trim());
        const hasUrl = Boolean((t.url ?? "").trim());
        const hasScore = typeof t.relevance_score === "number";
        const hasCategory = Boolean((t.category ?? "").trim());
        const hasDate = Boolean((t.published_date ?? "").trim());
        const hasWeek = typeof t.week_number === "number" && t.week_number > 0;
        return (
          hasTopic ||
          hasSummary ||
          hasImpact ||
          hasUrl ||
          hasScore ||
          hasCategory ||
          hasDate ||
          hasWeek
        );
      });
  }, [trends]);

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const t of normalizedTrends) {
      if (t.category && t.category.trim()) cats.add(t.category.trim());
    }
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [normalizedTrends]);

  const availableTimeKeys = useMemo(() => {
    const set = new Set<string>();
    for (const t of normalizedTrends) {
      const d = safeDate(t.published_date);
      if (groupBy === "week") {
        if (t.week_number) set.add(String(t.week_number));
      } else if (groupBy === "day") {
        if (d) set.add(isoDayKey(d));
      } else {
        if (d) set.add(monthKey(d));
      }
    }
    const list = Array.from(set);
    if (groupBy === "week") return list.sort((a, b) => Number(b) - Number(a));
    return list.sort((a, b) => b.localeCompare(a));
  }, [groupBy, normalizedTrends]);

  useEffect(() => {
    setTimeKey("all");
  }, [groupBy]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) {
        setLoading(false);
        setError(
          "Supabase env vars fehlen. Bitte setze NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY."
        );
        return;
      }

      if (!supabase) {
        setLoading(false);
        setError(
          "Supabase Client konnte nicht initialisiert werden. Prüfe NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY."
        );
        return;
      }

      const { data, error } = await supabase
        .from("trends")
        .select(
          "id, topic, category, relevance_score, summary, spotify_impact, url, published_date, week_number"
        )
        .order("week_number", { ascending: false })
        .order("relevance_score", { ascending: false })
        .limit(300);

      if (cancelled) return;
      if (error) {
        setError(error.message);
        setTrends([]);
      } else {
        setTrends((data ?? []) as Trend[]);
      }

      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const min = clamp01(minScore);

    return normalizedTrends.filter((t) => {
      const score = t.relevance_score ?? 0;
      if (score < min) return false;

      const cat = (t.category ?? "").trim();
      if (category !== "all" && cat !== category) return false;

      if (timeKey !== "all") {
        const d = safeDate(t.published_date);
        if (groupBy === "week") {
          if (String(t.week_number ?? "") !== timeKey) return false;
        } else if (groupBy === "day") {
          if (!d || isoDayKey(d) !== timeKey) return false;
        } else {
          if (!d || monthKey(d) !== timeKey) return false;
        }
      }

      return true;
    });
  }, [category, groupBy, minScore, normalizedTrends, timeKey]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Trend[]>();
    for (const t of filtered) {
      const d = safeDate(t.published_date);
      let key = "Ohne Datum";
      if (groupBy === "week") key = t.week_number ? `KW ${t.week_number}` : "Ohne KW";
      if (groupBy === "day") key = d ? d.toLocaleDateString("de-DE") : "Ohne Datum";
      if (groupBy === "month") {
        key = d
          ? d.toLocaleDateString("de-DE", { month: "long", year: "numeric" })
          : "Ohne Monat";
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    const keys = Array.from(groups.keys());
    // Keep "Ohne..." at the end, otherwise sort descending-ish
    const withMeta = keys.map((k) => ({
      key: k,
      sortKey: k.startsWith("Ohne") ? "" : k,
      isMissing: k.startsWith("Ohne"),
    }));

    withMeta.sort((a, b) => {
      if (a.isMissing && !b.isMissing) return 1;
      if (!a.isMissing && b.isMissing) return -1;
      if (groupBy === "week") {
        const an = Number(a.key.replace(/[^\d]/g, "")) || 0;
        const bn = Number(b.key.replace(/[^\d]/g, "")) || 0;
        return bn - an;
      }
      return b.sortKey.localeCompare(a.sortKey);
    });

    return withMeta.map(({ key }) => ({ label: key, items: groups.get(key)! }));
  }, [filtered, groupBy]);

  const toggleExpanded = (id: Trend["id"]) => {
    const key = String(id);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const kpis = useMemo(() => {
    const count = filtered.length;
    const scores = filtered.map((t) => t.relevance_score).filter((s): s is number => typeof s === "number");
    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const highPriority = filtered.filter((t) => (t.relevance_score ?? 0) >= 0.8).length;
    const catCounts = new Map<string, number>();
    for (const t of filtered) {
      const c = (t.category ?? "").trim() || "Unkategorisiert";
      catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
    }
    const topCategory =
      Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    const distribution = {
      high: filtered.filter((t) => (t.relevance_score ?? 0) >= 0.8).length,
      mid: filtered.filter((t) => (t.relevance_score ?? 0) >= 0.6 && (t.relevance_score ?? 0) < 0.8).length,
      low: filtered.filter((t) => (t.relevance_score ?? 0) < 0.6).length,
    };

    const categoryBars = Array.from(catCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value }));

    return { count, avgScore, topCategory, highPriority, distribution, categoryBars };
  }, [filtered]);

  const donut = useMemo(() => {
    const total = kpis.distribution.high + kpis.distribution.mid + kpis.distribution.low;
    const pct = (n: number) => (total ? n / total : 0);
    return {
      total,
      high: pct(kpis.distribution.high),
      mid: pct(kpis.distribution.mid),
      low: pct(kpis.distribution.low),
    };
  }, [kpis.distribution]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(29,185,84,0.16),rgba(0,0,0,0))]" />

      <header className="border-b border-white/10 bg-zinc-950/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/spotify-mark.svg"
                alt="Spotify"
                className="h-8 w-8"
                draggable={false}
              />
              <div className="min-w-0">
                <p className="text-sm text-zinc-400">Spotify</p>
                <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                  Spotify Trend Radar
                </h1>
              </div>
            </div>

            <nav className="hidden items-center gap-2 text-sm text-zinc-300 sm:flex">
              <span className="rounded-full bg-white/10 px-3 py-1.5">Dashboard</span>
              <span className="rounded-full px-3 py-1.5 hover:bg-white/5">Ask AI</span>
              <span className="rounded-full px-3 py-1.5 hover:bg-white/5">Export</span>
            </nav>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.3fr_auto_1fr_1fr] lg:items-center">
              <div className="space-y-1">
                <p className="text-xs text-zinc-400">Datenquelle</p>
                <div className="flex items-center gap-2">
                  <input
                    value={dataSourceUrl}
                    onChange={(e) => setDataSourceUrl(e.target.value)}
                    placeholder="Google Sheet CSV Link einfügen… (optional)"
                    className="h-11 w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none ring-0 focus:border-[#1DB954]/60"
                  />
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1DB954] px-4 text-sm font-semibold text-zinc-950 hover:bg-[#1ed760]"
                    onClick={() => {
                      // UI only for now (n8n / CSV ingest happens outside this dashboard).
                      setDataSourceUrl((s) => s.trim());
                    }}
                    title="(Platzhalter) Laden"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Laden
                  </button>
                </div>
                <p className="text-xs text-zinc-500">Hinweis: Import passiert aktuell über n8n/Supabase.</p>
              </div>

              <div className="hidden lg:block" />

              <div className="space-y-1">
                <p className="text-xs text-zinc-400">Kategorie Filter</p>
                <div className="relative">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-zinc-950/60 px-3 pr-10 text-sm text-zinc-100 outline-none focus:border-[#1DB954]/60"
                  >
                    <option value="all">Alle Kategorien</option>
                    {allCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-400">Min. Relevanz Score</p>
                  <p className="text-xs font-semibold text-[#1DB954]">
                    {clamp01(minScore).toFixed(2)}
                  </p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="mt-1 w-full accent-[#1DB954]"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Calendar className="h-4 w-4" />
                <span>
                  Aktuelle KW: <span className="font-semibold text-zinc-200">KW {currentWeek}</span>
                </span>
                <span className="text-zinc-600">·</span>
                <span>
                  Letzte KW: <span className="font-semibold text-zinc-200">KW {lastWeek}</span>
                </span>
              </div>

              <div className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
                <Filter className="h-4 w-4" />
                <span>
                  <span className="font-semibold text-zinc-100">{filtered.length}</span> Trends
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-zinc-950/40 p-1 text-sm">
                {(["week", "day", "month"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setGroupBy(k)}
                    className={cx(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                      groupBy === k ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5"
                    )}
                  >
                    {k === "week" ? "KW" : k === "day" ? "Tag" : "Monat"}
                  </button>
                ))}
              </div>

              <div className="relative">
                <select
                  value={timeKey}
                  onChange={(e) => setTimeKey(e.target.value)}
                  className="h-9 appearance-none rounded-xl border border-white/10 bg-zinc-950/40 px-3 pr-9 text-xs text-zinc-200 outline-none focus:border-[#1DB954]/60"
                >
                  <option value="all">
                    {groupBy === "week" ? "Alle Wochen" : groupBy === "day" ? "Alle Tage" : "Alle Monate"}
                  </option>
                  {availableTimeKeys.map((k) => (
                    <option key={k} value={k}>
                      {groupBy === "week" ? `KW ${k}` : k}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-zinc-400">Aktive Trends</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-zinc-50">{kpis.count}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-zinc-400">Durchschn. Score</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-[#1DB954]">
              {kpis.avgScore === null ? "—" : clamp01(kpis.avgScore).toFixed(2)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-zinc-400">Top Kategorie</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50">{kpis.topCategory}</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-zinc-400">High Priority (Score ≥ 0.8)</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-rose-300">{kpis.highPriority}</p>
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-rose-500/10 blur-2xl" />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-200">Verteilung nach Kategorie</p>
              <BarChart3 className="h-4 w-4 text-zinc-400" />
            </div>
            <div className="mt-4 grid grid-cols-6 items-end gap-2">
              {kpis.categoryBars.length === 0 ? (
                <p className="col-span-6 text-sm text-zinc-500">Keine Daten.</p>
              ) : (
                kpis.categoryBars.map((b) => {
                  const max = Math.max(...kpis.categoryBars.map((x) => x.value), 1);
                  const h = Math.round((b.value / max) * 100);
                  return (
                    <div key={b.name} className="flex flex-col items-center gap-2">
                      <div className="h-28 w-full rounded-xl bg-zinc-950/40 p-2">
                        <div
                          className="w-full rounded-lg bg-[#1DB954]/70"
                          style={{ height: `${Math.max(8, h)}%` }}
                          title={`${b.name}: ${b.value}`}
                        />
                      </div>
                      <p className="w-full truncate text-center text-[11px] text-zinc-400" title={b.name}>
                        {b.name}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-200">Relevanz-Verteilung</p>
              <Flame className="h-4 w-4 text-zinc-400" />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr] sm:items-center">
              <div className="flex items-center justify-center">
                <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Relevanz Donut">
                  <circle cx="80" cy="80" r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="18" />
                  {/* Low */}
                  <circle
                    cx="80"
                    cy="80"
                    r="52"
                    fill="none"
                    stroke="rgba(148,163,184,0.9)"
                    strokeWidth="18"
                    strokeDasharray={`${donut.low * 326} 326`}
                    strokeDashoffset={0}
                    strokeLinecap="round"
                    transform="rotate(-90 80 80)"
                  />
                  {/* Mid */}
                  <circle
                    cx="80"
                    cy="80"
                    r="52"
                    fill="none"
                    stroke="rgba(34,197,94,0.9)"
                    strokeWidth="18"
                    strokeDasharray={`${donut.mid * 326} 326`}
                    strokeDashoffset={-(donut.low * 326)}
                    strokeLinecap="round"
                    transform="rotate(-90 80 80)"
                  />
                  {/* High */}
                  <circle
                    cx="80"
                    cy="80"
                    r="52"
                    fill="none"
                    stroke="rgba(248,113,113,0.95)"
                    strokeWidth="18"
                    strokeDasharray={`${donut.high * 326} 326`}
                    strokeDashoffset={-((donut.low + donut.mid) * 326)}
                    strokeLinecap="round"
                    transform="rotate(-90 80 80)"
                  />
                  <text x="80" y="78" textAnchor="middle" fill="white" fontSize="18" fontWeight="700">
                    {donut.total}
                  </text>
                  <text x="80" y="98" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="11">
                    Trends
                  </text>
                </svg>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-xl bg-zinc-950/40 px-3 py-2">
                  <span className="text-zinc-300">High (0.8+)</span>
                  <span className="font-semibold text-rose-300">{kpis.distribution.high}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-zinc-950/40 px-3 py-2">
                  <span className="text-zinc-300">Mid (0.6–0.79)</span>
                  <span className="font-semibold text-emerald-300">{kpis.distribution.mid}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-zinc-950/40 px-3 py-2">
                  <span className="text-zinc-300">Low (&lt;0.6)</span>
                  <span className="font-semibold text-slate-300">{kpis.distribution.low}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-6 text-zinc-300">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              <p>Trends werden geladen…</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-200">
              <p className="font-semibold">Fehler beim Laden</p>
              <p className="mt-1 text-sm opacity-90">{error}</p>
            </div>
          ) : grouped.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-zinc-300">
              <p className="font-semibold">Keine Trends gefunden</p>
              <p className="mt-1 text-sm text-zinc-500">
                Prüfe n8n Import, Supabase Daten oder passe Filter an.
              </p>
            </div>
          ) : (
            grouped.map(({ label, items }) => (
              <div key={label} className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <h2 className="text-sm font-semibold text-zinc-200">{label}</h2>
                  <p className="text-xs text-zinc-500">{items.length} Trends</p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((t) => {
                    const idKey = String(t.id);
                    const isOpen = Boolean(expanded[idKey]);
                    const summary = (t.summary ?? "").trim();
                    const short =
                      summary.length > 190 ? summary.slice(0, 190).trimEnd() + "…" : summary;
                    const cat = (t.category ?? "").trim();
                    const categoryLabel = cat || "Unkategorisiert";
                    const score = t.relevance_score ?? null;
                    const topic = (t.topic ?? "").trim();
                    const impact = (t.spotify_impact ?? "").trim();
                    const url = (t.url ?? "").trim();

                    return (
                      <article
                        key={idKey}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm shadow-black/40 transition hover:-translate-y-0.5 hover:bg-white/7"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            {categoryLabel ? (
                              <span
                                className={cx(
                                  "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                                  categoryStyles(categoryLabel)
                                )}
                              >
                                {categoryLabel}
                              </span>
                            ) : null}
                            {score !== null ? (
                              <span className={cx("text-xs font-semibold", scoreColor(score))}>
                                {formatScore(score)}
                              </span>
                            ) : null}
                          </div>
                          {t.published_date ? (
                            <span className="text-xs text-zinc-500">
                              {new Date(t.published_date).toLocaleDateString("de-DE")}
                            </span>
                          ) : null}
                        </div>

                        {topic ? (
                          <h3 className="mt-3 text-base font-semibold leading-6 text-zinc-50">
                            {topic}
                          </h3>
                        ) : null}

                        {summary ? (
                          <div className="mt-2 text-sm leading-6 text-zinc-300">
                            <p>{isOpen ? summary : short}</p>
                            {summary.length > 190 ? (
                              <button
                                type="button"
                                onClick={() => toggleExpanded(t.id)}
                                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#1DB954] hover:underline"
                              >
                                {isOpen ? (
                                  <>
                                    <Minus className="h-4 w-4" /> Weniger
                                  </>
                                ) : (
                                  <>
                                    <Plus className="h-4 w-4" /> Mehr lesen
                                  </>
                                )}
                              </button>
                            ) : null}
                          </div>
                        ) : null}

                        {(impact || url) && (
                          <div className="mt-4 border-t border-white/10 pt-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                {impact ? (
                                  <>
                                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                                      Spotify Relevanz
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-[#1DB954]">
                                      {impact}
                                    </p>
                                  </>
                                ) : null}
                              </div>

                              {url ? (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-white/5"
                                >
                                  Artikel <ExternalLink className="h-4 w-4" />
                                </a>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
