"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
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

type TimeRange = "last_week" | "this_month" | "all";

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

  const [timeRange, setTimeRange] = useState<TimeRange>("this_month");
  const [minScore, setMinScore] = useState<number>(0.5);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const t of trends) {
      if (t.category && t.category.trim()) cats.add(t.category.trim());
    }
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [trends]);

  useEffect(() => {
    // Initialize selection to "all categories" after first load.
    if (allCategories.length && selectedCategories.length === 0) {
      setSelectedCategories(allCategories);
    }
  }, [allCategories, selectedCategories.length]);

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
    const selected = new Set(selectedCategories);

    return trends.filter((t) => {
      const score = t.relevance_score ?? 0;
      if (score < min) return false;

      const cat = (t.category ?? "").trim();
      if (selected.size > 0 && cat && !selected.has(cat)) return false;

      if (timeRange === "last_week") {
        return (t.week_number ?? -1) === lastWeek;
      }
      if (timeRange === "this_month") {
        return isThisMonth(t.published_date, now);
      }
      return true;
    });
  }, [lastWeek, minScore, now, selectedCategories, timeRange, trends]);

  const groupedByWeek = useMemo(() => {
    const groups = new Map<number, Trend[]>();
    for (const t of filtered) {
      const wk = t.week_number ?? 0;
      if (!groups.has(wk)) groups.set(wk, []);
      groups.get(wk)!.push(t);
    }

    const sortedWeeks = Array.from(groups.keys()).sort((a, b) => b - a);
    return sortedWeeks.map((wk) => ({
      week: wk,
      items: groups.get(wk)!,
    }));
  }, [filtered]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      const set = new Set(prev);
      if (set.has(cat)) set.delete(cat);
      else set.add(cat);
      return Array.from(set).sort((a, b) => a.localeCompare(b));
    });
  };

  const selectAllCategories = () => setSelectedCategories(allCategories);
  const clearCategories = () => setSelectedCategories([]);

  const toggleExpanded = (id: Trend["id"]) => {
    const key = String(id);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(29,185,84,0.18),rgba(0,0,0,0))]" />

      <header className="border-b border-zinc-200/70 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/50 dark:border-white/10 dark:bg-black/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <Calendar className="h-4 w-4" />
              <span>
                Aktuelle Kalenderwoche: <span className="font-semibold">KW {currentWeek}</span>
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Spotify Trend Dashboard
                </h1>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Trends aus Supabase, gefiltert nach Zeitraum, Kategorie und Score.
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#1DB954]" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white p-1 text-sm dark:border-white/10 dark:bg-zinc-950">
              <button
                type="button"
                onClick={() => setTimeRange("last_week")}
                className={cx(
                  "rounded-full px-3 py-1.5 transition",
                  timeRange === "last_week"
                    ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5"
                )}
              >
                Letzte Woche
              </button>
              <button
                type="button"
                onClick={() => setTimeRange("this_month")}
                className={cx(
                  "rounded-full px-3 py-1.5 transition",
                  timeRange === "this_month"
                    ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5"
                )}
              >
                Diesen Monat
              </button>
              <button
                type="button"
                onClick={() => setTimeRange("all")}
                className={cx(
                  "rounded-full px-3 py-1.5 transition",
                  timeRange === "all"
                    ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5"
                )}
              >
                Alle
              </button>
            </div>

            <div className="ml-auto flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <Filter className="h-4 w-4" />
              <span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {filtered.length}
                </span>{" "}
                Trends
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_1fr]">
        <aside className="h-fit rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-[#1DB954]" />
              <h2 className="font-semibold">Filter</h2>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                className="rounded-full px-2 py-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5"
                onClick={selectAllCategories}
              >
                Alle
              </button>
              <button
                type="button"
                className="rounded-full px-2 py-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5"
                onClick={clearCategories}
              >
                Keine
              </button>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Min-Score</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {(clamp01(minScore) * 100).toFixed(0)}%
              </p>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="mt-2 w-full accent-[#1DB954]"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
              <span>0</span>
              <span>1</span>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium">Kategorien</p>
            <div className="mt-3 space-y-2">
              {allCategories.length === 0 ? (
                <p className="text-sm text-zinc-500">Keine Kategorien geladen.</p>
              ) : (
                allCategories.map((cat) => {
                  const checked = selectedCategories.includes(cat);
                  return (
                    <label
                      key={cat}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-zinc-50 dark:hover:bg-white/5"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCategory(cat)}
                          className="h-4 w-4 accent-[#1DB954]"
                        />
                        <span className="min-w-0 truncate text-sm">{cat}</span>
                      </div>
                      <span
                        className={cx(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] ring-1",
                          categoryStyles(cat)
                        )}
                      >
                        {checked ? "an" : "aus"}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        <main className="space-y-6">
          {loading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-700 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              <p>Trends werden geladen…</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
              <p className="font-medium">Fehler beim Laden</p>
              <p className="mt-1 text-sm opacity-90">{error}</p>
            </div>
          ) : groupedByWeek.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-700 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300">
              <p className="font-medium">Keine Trends gefunden</p>
              <p className="mt-1 text-sm text-zinc-500">
                Passe Filter (Zeitraum/Kategorie/Score) an oder prüfe deine Supabase-Daten.
              </p>
            </div>
          ) : (
            groupedByWeek.map(({ week, items }) => (
              <section key={week} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {week ? `KW ${week}` : "Ohne KW"}
                  </h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {items.length} {items.length === 1 ? "Trend" : "Trends"}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((t) => {
                    const idKey = String(t.id);
                    const isOpen = Boolean(expanded[idKey]);
                    const summary = (t.summary ?? "").trim();
                    const short = summary.length > 190 ? summary.slice(0, 190).trimEnd() + "…" : summary;
                    const category = (t.category ?? "Unkategorisiert").trim() || "Unkategorisiert";
                    const score = t.relevance_score ?? null;

                    return (
                      <article
                        key={idKey}
                        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-zinc-950 dark:shadow-black/30"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={cx(
                                "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1",
                                categoryStyles(category)
                              )}
                            >
                              {category}
                            </span>
                            <span className={cx("text-sm font-semibold", scoreColor(score))}>
                              {formatScore(score)}
                            </span>
                          </div>
                          {t.published_date ? (
                            <span className="text-xs text-zinc-500">
                              {new Date(t.published_date).toLocaleDateString("de-DE")}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 space-y-2">
                          <h3 className="text-base font-semibold leading-6">{t.topic ?? "—"}</h3>

                          {summary ? (
                            <div className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                              <p>{isOpen ? summary : short}</p>
                              {summary.length > 190 ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(t.id)}
                                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#1DB954] hover:underline"
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
                          ) : (
                            <p className="text-sm text-zinc-500">Keine Summary.</p>
                          )}
                        </div>

                        <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-white/10">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs uppercase tracking-wide text-zinc-500">
                                Spotify Impact
                              </p>
                              <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                {t.spotify_impact ? (
                                  <span className="text-[#1DB954]">{t.spotify_impact}</span>
                                ) : (
                                  <span className="text-zinc-500">—</span>
                                )}
                              </p>
                            </div>

                            {t.url ? (
                              <a
                                href={t.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
                              >
                                Artikel <ExternalLink className="h-4 w-4" />
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </main>
      </div>
    </div>
  );
}
