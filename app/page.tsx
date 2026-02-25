"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

function safeDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function getISOWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNo;
}

function isoDayKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function formatScore(score: number | null) {
  if (score === null || Number.isNaN(score)) return "";
  return clamp01(score).toFixed(2);
}

function scoreColor(score: number | null) {
  if (score === null || Number.isNaN(score)) return "text-zinc-400";
  const s = clamp01(score);
  if (s >= 0.8) return "text-rose-300";
  if (s >= 0.6) return "text-emerald-300";
  if (s >= 0.4) return "text-amber-300";
  return "text-zinc-300";
}

function categoryStyles(category: string) {
  const key = category.toLowerCase();
  if (key.includes("spotify")) return "bg-[#1DB954]/20 text-[#35e06f] ring-[#1DB954]/40";
  if (key.includes("wettbewerb") || key.includes("competition")) {
    return "bg-rose-500/20 text-rose-300 ring-rose-500/40";
  }
  if (key.includes("marketing") || key.includes("markt")) {
    return "bg-sky-500/20 text-sky-300 ring-sky-500/40";
  }
  if (key.includes("audio") || key.includes("podcast")) {
    return "bg-violet-500/20 text-violet-300 ring-violet-500/40";
  }
  return "bg-zinc-500/20 text-zinc-300 ring-zinc-500/40";
}

function slotKeyForTrend(t: Trend, groupBy: GroupBy) {
  const d = safeDate(t.published_date);
  if (groupBy === "week") return t.week_number ? `week:${t.week_number}` : "week:unknown";
  if (groupBy === "day") return d ? `day:${isoDayKey(d)}` : "day:unknown";
  return d ? `month:${monthKey(d)}` : "month:unknown";
}

function slotLabelFromKey(key: string, groupBy: GroupBy) {
  if (key.endsWith(":unknown")) {
    if (groupBy === "week") return "Ohne KW";
    if (groupBy === "day") return "Ohne Datum";
    return "Ohne Monat";
  }

  const raw = key.split(":")[1] ?? "";
  if (groupBy === "week") return `KW ${raw}`;
  if (groupBy === "day") {
    const d = safeDate(raw);
    return d ? d.toLocaleDateString("de-DE") : raw;
  }

  const [y, m] = raw.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function compactText(text: string, len: number) {
  const cleaned = text.trim();
  if (cleaned.length <= len) return cleaned;
  return `${cleaned.slice(0, len).trimEnd()}…`;
}

export default function Page() {
  const now = useMemo(() => new Date(), []);
  const currentWeek = useMemo(() => getISOWeek(now), [now]);
  const previousWeek = useMemo(() => (currentWeek > 1 ? currentWeek - 1 : 52), [currentWeek]);

  const [groupBy, setGroupBy] = useState<GroupBy>("week");
  const [selectedSlot, setSelectedSlot] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [minScore, setMinScore] = useState<number>(0);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);

  const loadTrends = useCallback(async (background = false) => {
    if (!background) {
      setLoading(true);
    }
    setError(null);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      if (!background) setLoading(false);
      setError(
        "Supabase env vars fehlen. Bitte setze NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
      return;
    }

    if (!supabase) {
      if (!background) setLoading(false);
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
      .order("published_date", { ascending: false })
      .order("relevance_score", { ascending: false })
      .limit(400);

    if (error) {
      setError(error.message);
      setTrends([]);
    } else {
      setTrends((data ?? []) as Trend[]);
    }

    if (!background) {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void loadTrends(false);

    const sb = supabase;
    if (!sb) return () => {};

    const channel = sb
      .channel("public:trends-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trends" },
        () => {
          if (active) void loadTrends(true);
        }
      )
      .subscribe();

    const pollId = window.setInterval(() => {
      if (active) void loadTrends(true);
    }, 30000);

    const onFocus = () => {
      if (active) void loadTrends(true);
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      active = false;
      window.clearInterval(pollId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      void sb.removeChannel(channel);
    };
  }, [loadTrends]);

  const normalizedTrends = useMemo(() => {
    return trends
      .map((t) => {
        const d = safeDate(t.published_date);
        return {
          ...t,
          week_number: t.week_number ?? (d ? getISOWeek(d) : null),
        };
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

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of normalizedTrends) {
      if (t.category && t.category.trim()) set.add(t.category.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [normalizedTrends]);

  const slotOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of normalizedTrends) {
      set.add(slotKeyForTrend(t, groupBy));
    }
    const keys = Array.from(set);

    keys.sort((a, b) => {
      if (a.endsWith(":unknown") && !b.endsWith(":unknown")) return 1;
      if (!a.endsWith(":unknown") && b.endsWith(":unknown")) return -1;

      const av = a.split(":")[1] ?? "";
      const bv = b.split(":")[1] ?? "";

      if (groupBy === "week") return Number(bv) - Number(av);
      return bv.localeCompare(av);
    });

    return keys.map((key) => ({ key, label: slotLabelFromKey(key, groupBy) }));
  }, [groupBy, normalizedTrends]);

  useEffect(() => {
    setSelectedSlot("all");
  }, [groupBy]);

  const filtered = useMemo(() => {
    const min = clamp01(minScore);

    return normalizedTrends.filter((t) => {
      const score = t.relevance_score ?? 0;
      if (score < min) return false;

      const category = (t.category ?? "").trim();
      if (selectedCategory !== "all" && category !== selectedCategory) return false;

      if (selectedSlot !== "all") {
        const key = slotKeyForTrend(t, groupBy);
        if (key !== selectedSlot) return false;
      }

      return true;
    });
  }, [groupBy, minScore, normalizedTrends, selectedCategory, selectedSlot]);

  const grouped = useMemo(() => {
    const map = new Map<string, Trend[]>();

    for (const t of filtered) {
      const key = slotKeyForTrend(t, groupBy);
      const label = slotLabelFromKey(key, groupBy);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(t);
    }

    const labels = Array.from(map.keys());
    labels.sort((a, b) => {
      const aUnknown = a.startsWith("Ohne");
      const bUnknown = b.startsWith("Ohne");
      if (aUnknown && !bUnknown) return 1;
      if (!aUnknown && bUnknown) return -1;

      if (groupBy === "week") {
        const an = Number(a.replace(/\D/g, "")) || 0;
        const bn = Number(b.replace(/\D/g, "")) || 0;
        return bn - an;
      }

      return b.localeCompare(a, "de-DE");
    });

    return labels.map((label) => ({
      label,
      items: map.get(label) ?? [],
    }));
  }, [filtered, groupBy]);

  const kpis = useMemo(() => {
    const count = filtered.length;
    const scores = filtered
      .map((t) => t.relevance_score)
      .filter((v): v is number => typeof v === "number");

    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const highPriority = filtered.filter((t) => (t.relevance_score ?? 0) >= 0.8).length;

    const categoryCount = new Map<string, number>();
    for (const t of filtered) {
      const cat = (t.category ?? "").trim() || "Unkategorisiert";
      categoryCount.set(cat, (categoryCount.get(cat) ?? 0) + 1);
    }

    const topCategory =
      Array.from(categoryCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    const distHigh = filtered.filter((t) => (t.relevance_score ?? 0) >= 0.8).length;
    const distMid = filtered.filter(
      (t) => (t.relevance_score ?? 0) >= 0.6 && (t.relevance_score ?? 0) < 0.8
    ).length;
    const distLow = filtered.filter((t) => (t.relevance_score ?? 0) < 0.6).length;

    const bars = Array.from(categoryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value }));

    return {
      count,
      avgScore,
      topCategory,
      highPriority,
      distHigh,
      distMid,
      distLow,
      bars,
    };
  }, [filtered]);

  const donutStyle = useMemo(() => {
    const total = Math.max(1, kpis.distHigh + kpis.distMid + kpis.distLow);
    const highPct = (kpis.distHigh / total) * 100;
    const midPct = (kpis.distMid / total) * 100;
    const lowPct = (kpis.distLow / total) * 100;

    return {
      total: kpis.distHigh + kpis.distMid + kpis.distLow,
      style: {
        background: `conic-gradient(
          rgba(248,113,113,0.95) 0% ${highPct}%,
          rgba(52,211,153,0.95) ${highPct}% ${highPct + midPct}%,
          rgba(148,163,184,0.9) ${highPct + midPct}% ${highPct + midPct + lowPct}%
        )`,
      } as React.CSSProperties,
    };
  }, [kpis.distHigh, kpis.distLow, kpis.distMid]);

  const toggleExpanded = (id: Trend["id"]) => {
    const key = String(id);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-[#13151a] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_50%_0%,rgba(29,185,84,0.14),rgba(0,0,0,0))]" />

      <header className="border-b border-zinc-800/80 bg-zinc-900/75 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-zinc-800/80 p-2 ring-1 ring-zinc-700/70">
                <img src="/spotify-wordmark.svg" alt="Spotify" className="h-8 w-auto sm:h-9" draggable={false} />
              </div>
              <div>
                <p className="text-xs text-zinc-400">Spotify</p>
                <h1 className="text-[1.7rem] font-semibold tracking-tight sm:text-[1.9rem]">Trend Radar</h1>
              </div>
            </div>

            <div className="hidden items-center gap-2 rounded-full bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 ring-1 ring-zinc-700 sm:flex">
              <Sparkles className="h-3.5 w-3.5 text-[#1DB954]" />
              Fresh Insights
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-zinc-700/70 bg-zinc-800/45 p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_auto_1fr_1fr] lg:items-end">
              <div className="space-y-2">
                <p className="text-[11px] text-zinc-400">Zeitraum</p>
                <div className="flex items-center gap-1 rounded-2xl border border-zinc-700 bg-zinc-900/65 p-1">
                  {([
                    ["week", "KW"],
                    ["day", "Tag"],
                    ["month", "Monat"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setGroupBy(value)}
                      className={cx(
                        "rounded-xl px-4 py-2 text-sm font-medium transition",
                        groupBy === value
                          ? "bg-zinc-200 text-zinc-900"
                          : "text-zinc-300 hover:bg-zinc-800"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] text-zinc-400">Auswahl</p>
                <div className="relative">
                  <select
                    value={selectedSlot}
                    onChange={(e) => setSelectedSlot(e.target.value)}
                    className="h-11 min-w-[180px] appearance-none rounded-2xl border border-zinc-700 bg-zinc-900/65 px-3 pr-10 text-sm text-zinc-100 outline-none focus:border-[#1DB954]/60"
                  >
                    <option value="all">
                      {groupBy === "week"
                        ? "Alle Wochen"
                        : groupBy === "day"
                          ? "Alle Tage"
                          : "Alle Monate"}
                    </option>
                    {slotOptions.map((slot) => (
                      <option key={slot.key} value={slot.key}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] text-zinc-400">Kategorie Filter</p>
                <div className="relative">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="h-11 w-full appearance-none rounded-2xl border border-zinc-700 bg-zinc-900/65 px-3 pr-10 text-sm text-zinc-100 outline-none focus:border-[#1DB954]/60"
                  >
                    <option value="all">Alle Kategorien</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <p className="text-zinc-400 text-[11px]">Min. Relevanz Score</p>
                  <p className="font-semibold text-[#1DB954]">{clamp01(minScore).toFixed(2)}</p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-full accent-[#1DB954]"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
              <span className="inline-flex items-center gap-2 rounded-full bg-zinc-900/60 px-3 py-1 ring-1 ring-zinc-700/80">
                <Calendar className="h-4 w-4" /> Aktuelle KW: <strong className="text-zinc-200">KW {currentWeek}</strong>
              </span>
              <span className="inline-flex items-center rounded-full bg-zinc-900/60 px-3 py-1 ring-1 ring-zinc-700/80">
                Letzte KW: <strong className="ml-1 text-zinc-200">KW {previousWeek}</strong>
              </span>
              <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-zinc-900/60 px-3 py-1 ring-1 ring-zinc-700/80">
                <Filter className="h-4 w-4" />
                <strong className="text-zinc-200">{filtered.length}</strong> Trends
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-zinc-700/70 bg-zinc-800/45 p-5">
            <p className="text-sm text-zinc-400">Aktive Trends</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight">{kpis.count}</p>
          </div>
          <div className="rounded-3xl border border-zinc-700/70 bg-zinc-800/45 p-5">
            <p className="text-sm text-zinc-400">Durchschn. Score</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-[#1DB954]">
              {kpis.avgScore === null ? "—" : clamp01(kpis.avgScore).toFixed(2)}
            </p>
          </div>
          <div className="rounded-3xl border border-zinc-700/70 bg-zinc-800/45 p-5">
            <p className="text-sm text-zinc-400">Top Kategorie</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{kpis.topCategory}</p>
          </div>
          <div className="relative overflow-hidden rounded-3xl border border-zinc-700/70 bg-zinc-800/45 p-5">
            <p className="text-sm text-zinc-400">High Priority (Score ≥ 0.8)</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-rose-300">{kpis.highPriority}</p>
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-rose-400/10 blur-2xl" />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-700/70 bg-zinc-800/45 p-5">
            <div className="flex items-center justify-between">
              <p className="text-xl font-semibold tracking-tight">Verteilung nach Kategorie</p>
              <BarChart3 className="h-5 w-5 text-zinc-400" />
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {kpis.bars.length === 0 ? (
                <p className="col-span-full text-sm text-zinc-500">Keine Daten für Kategorie-Verteilung.</p>
              ) : (
                kpis.bars.map((bar) => {
                  const max = Math.max(...kpis.bars.map((x) => x.value), 1);
                  const heightPct = Math.max(12, Math.round((bar.value / max) * 100));
                  return (
                    <div key={bar.name} className="space-y-2">
                      <div className="flex h-28 items-end rounded-xl bg-zinc-900/70 p-2 ring-1 ring-zinc-700">
                        <div
                          className="w-full rounded-lg bg-[#1DB954]/80"
                          style={{ height: `${heightPct}%` }}
                          title={`${bar.name}: ${bar.value}`}
                        />
                      </div>
                      <p className="truncate text-sm text-zinc-400" title={bar.name}>
                        {bar.name}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-700/70 bg-zinc-800/45 p-5">
            <div className="flex items-center justify-between">
              <p className="text-xl font-semibold tracking-tight">Relevanz-Verteilung</p>
              <Flame className="h-5 w-5 text-zinc-400" />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-[180px_1fr] sm:items-center">
              <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full" style={donutStyle.style}>
                <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-zinc-900 text-center ring-1 ring-zinc-700">
                  <p className="text-3xl font-semibold">{donutStyle.total}</p>
                  <p className="text-xs text-zinc-400">Trends</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-xl bg-zinc-900/70 px-3 py-2 ring-1 ring-zinc-700">
                  <span className="text-zinc-300">High (0.8+)</span>
                  <span className="font-semibold text-rose-300">{kpis.distHigh}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-zinc-900/70 px-3 py-2 ring-1 ring-zinc-700">
                  <span className="text-zinc-300">Mid (0.6–0.79)</span>
                  <span className="font-semibold text-emerald-300">{kpis.distMid}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-zinc-900/70 px-3 py-2 ring-1 ring-zinc-700">
                  <span className="text-zinc-300">Low (&lt;0.6)</span>
                  <span className="font-semibold text-zinc-300">{kpis.distLow}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-3 rounded-3xl border border-zinc-700/70 bg-zinc-800/45 p-6 text-zinc-300">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              <p>Trends werden geladen…</p>
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200">
              <p className="font-semibold">Fehler beim Laden</p>
              <p className="mt-1 text-sm opacity-90">{error}</p>
            </div>
          ) : grouped.length === 0 ? (
            <div className="rounded-3xl border border-zinc-700/70 bg-zinc-800/45 p-6 text-zinc-300">
              <p className="font-semibold">Keine Trends gefunden</p>
              <p className="mt-1 text-sm text-zinc-500">
                Prüfe die n8n-Sync oder passe die Filter an.
              </p>
            </div>
          ) : (
            grouped.map(({ label, items }) => (
              <div key={label} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold tracking-tight text-zinc-200">{label}</h2>
                  <p className="text-sm text-zinc-500">{items.length} Trends</p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((t) => {
                    const idKey = String(t.id);
                    const isOpen = Boolean(expanded[idKey]);

                    const topic = (t.topic ?? "").trim();
                    const summary = (t.summary ?? "").trim();
                    const impact = (t.spotify_impact ?? "").trim();
                    const url = (t.url ?? "").trim();
                    const category = (t.category ?? "").trim() || "Unkategorisiert";
                    const score = t.relevance_score ?? null;
                    const date = safeDate(t.published_date);

                    const title = topic || (summary ? compactText(summary, 75) : "Trend ohne Titel");
                    const preview = summary ? compactText(summary, 120) : "";

                    return (
                      <article
                        key={idKey}
                        className="rounded-3xl border border-zinc-700/70 bg-zinc-800/50 p-4 shadow-sm shadow-black/35"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={cx(
                                "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                                categoryStyles(category)
                              )}
                            >
                              {category}
                            </span>
                            {score !== null ? (
                              <span className={cx("text-xs font-semibold", scoreColor(score))}>
                                {formatScore(score)}
                              </span>
                            ) : null}
                          </div>

                          {date ? (
                            <span className="shrink-0 text-xs text-zinc-500">
                              {date.toLocaleDateString("de-DE")}
                            </span>
                          ) : null}
                        </div>

                        <h3 className="mt-3 text-base font-semibold leading-tight text-zinc-100">{title}</h3>

                        {preview && !isOpen ? (
                          <p className="mt-2 text-[13px] leading-5 text-zinc-300">{preview}</p>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => toggleExpanded(t.id)}
                          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#1DB954] hover:underline"
                        >
                          {isOpen ? (
                            <>
                              <Minus className="h-4 w-4" /> Weniger anzeigen
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4" /> Details anzeigen
                            </>
                          )}
                        </button>

                        {isOpen ? (
                          <div className="mt-3 space-y-3 border-t border-zinc-700/80 pt-3">
                            {summary ? (
                              <p className="text-sm leading-6 text-zinc-200">{summary}</p>
                            ) : null}

                            <div className="grid grid-cols-1 gap-2 text-sm text-zinc-300">
                              {impact ? (
                                <div className="rounded-xl bg-zinc-900/70 px-3 py-2 ring-1 ring-zinc-700">
                                  <p className="text-xs uppercase tracking-wide text-zinc-500">Spotify Relevanz</p>
                                  <p className="mt-1 font-semibold text-[#1DB954]">{impact}</p>
                                </div>
                              ) : null}

                              {url ? (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-2 font-medium text-zinc-200 hover:bg-zinc-900"
                                >
                                  Quelle öffnen <ExternalLink className="h-4 w-4" />
                                </a>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
