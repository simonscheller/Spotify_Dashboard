"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Award,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  ExternalLink,
  Filter,
  Flame,
  LoaderCircle,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { supabase } from "../utils/supabase";

/* ── Types ───────────────────────────────────────────────────── */
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
  newsletter_source?: string | null;
};

type GroupBy = "week" | "day" | "month";

/* ── Utility functions ───────────────────────────────────────── */
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
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
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
  if (score === null || Number.isNaN(score)) return "text-muted-foreground";
  const s = clamp01(score);
  if (s >= 0.8) return "text-score-high";
  if (s >= 0.6) return "text-score-mid";
  return "text-score-low";
}

function categoryStyles(category: string) {
  const key = category.toLowerCase();
  if (key.includes("spotify")) return "bg-[#1DB954]/20 text-[#35e06f] ring-[#1DB954]/40";
  if (key.includes("wettbewerb") || key.includes("competition"))
    return "bg-score-high/20 text-score-high ring-score-high/40";
  if (key.includes("marketing") || key.includes("markt"))
    return "bg-sky-500/20 text-sky-300 ring-sky-500/40";
  if (key.includes("audio") || key.includes("podcast"))
    return "bg-violet-500/20 text-violet-300 ring-violet-500/40";
  return "bg-secondary text-secondary-foreground ring-glass-border";
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
  return `${cleaned.slice(0, len).trimEnd()}\u2026`;
}

/** Extract domain from URL for source clustering */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40) || "Unbekannte Quelle";
  }
}

function inferNewsletterSource(t: Trend): string {
  const src = (t.newsletter_source ?? "").trim();
  if (src) return src;
  const rawUrl = (t.url ?? "").trim();
  if (!rawUrl) return "Newsletter";
  return extractDomain(rawUrl);
}

/* ── TrendCard component ─────────────────────────────────────── */
type TrendCardProps = {
  t: Trend;
  isOpen: boolean;
  onToggle: () => void;
};

function TrendCard({ t, isOpen, onToggle }: TrendCardProps) {
  const topic = (t.topic ?? "").trim();
  const summary = (t.summary ?? "").trim();
  const impact = (t.spotify_impact ?? "").trim();
  const url = (t.url ?? "").trim();
  const category = (t.category ?? "").trim() || "Unkategorisiert";
  const score = t.relevance_score ?? null;
  const date = safeDate(t.published_date);
  const newsletterSource = inferNewsletterSource(t);
  const title = topic || (summary ? compactText(summary, 75) : "Trend ohne Titel");
  const preview = summary ? compactText(summary, 120) : "";

  return (
    <article onClick={onToggle} className="glass-card-hover p-5">
      {/* Badge row */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={cx("category-badge ring-1", categoryStyles(category))}>
            {category}
          </span>
          {score !== null ? (
            <span className={cx("score-badge", scoreColor(score))}>{formatScore(score)}</span>
          ) : null}
        </div>
        {date ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {date.toLocaleDateString("de-DE")}
          </span>
        ) : null}
      </div>

      <h3 className="mb-2 text-base font-semibold leading-snug">{title}</h3>

      {preview && !isOpen ? (
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{preview}</p>
      ) : null}

      <div className={cx("mt-2 text-xs text-muted-foreground", !isOpen && "line-clamp-2")}>
        Quelle: <span className="font-medium text-secondary-foreground">{newsletterSource}</span>
      </div>

      <div className="mt-3 flex items-center gap-1 text-sm font-medium text-primary">
        <span>{isOpen ? "Weniger anzeigen" : "Details anzeigen"}</span>
        <ChevronDown
          className={cx("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")}
        />
      </div>

      {isOpen ? (
        <div className="mt-3 space-y-3 border-t border-glass-border pt-3">
          {summary ? (
            <p className="text-sm leading-6 text-secondary-foreground">{summary}</p>
          ) : null}
          {impact ? (
            <div className="rounded-xl bg-secondary px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Spotify Relevanz
              </p>
              <p className="mt-1 font-semibold text-primary">{impact}</p>
            </div>
          ) : null}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-glass-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-glass-hover"
            >
              Quelle öffnen <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/* ── SourceGroup component ───────────────────────────────────── */
type SourceGroupProps = {
  domain: string;
  items: Trend[];
  isOpen: boolean;
  onToggle: () => void;
  expanded: Record<string, boolean>;
  onToggleExpand: (id: Trend["id"]) => void;
};

function SourceGroup({ domain, items, isOpen, onToggle, expanded, onToggleExpand }: SourceGroupProps) {
  const high = items.filter((t) => (t.relevance_score ?? 0) >= 0.8).length;
  const mid = items.filter(
    (t) => (t.relevance_score ?? 0) >= 0.6 && (t.relevance_score ?? 0) < 0.8
  ).length;
  const scores = items
    .map((t) => t.relevance_score)
    .filter((v): v is number => typeof v === "number");
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const topCat = (() => {
    const map = new Map<string, number>();
    for (const t of items) {
      const c = (t.category ?? "").trim() || "Unkategorisiert";
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  })();

  return (
    <div>
      {/* Header row */}
      <button
        type="button"
        onClick={onToggle}
        className="glass-card mb-2 flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-glass-hover"
      >
        <div className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className={cx(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen ? "rotate-0" : "-rotate-90"
            )}
          />
          <span className="truncate text-sm font-semibold text-foreground">{domain}</span>
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            {items.length}&nbsp;Trends
          </span>
        </div>

        <div className="ml-3 flex shrink-0 flex-wrap items-center gap-1.5">
          {high > 0 && (
            <span className="rounded-full bg-score-high/20 px-2 py-0.5 text-[10px] font-semibold text-score-high">
              {high}&nbsp;High
            </span>
          )}
          {mid > 0 && (
            <span className="rounded-full bg-score-mid/20 px-2 py-0.5 text-[10px] font-semibold text-score-mid">
              {mid}&nbsp;Mid
            </span>
          )}
          {topCat ? (
            <span className={cx("category-badge px-2 py-0.5 text-[10px] ring-1", categoryStyles(topCat))}>
              {topCat}
            </span>
          ) : null}
          {avgScore !== null ? (
            <span className="text-xs text-muted-foreground">
              {"Ø"}&nbsp;{clamp01(avgScore).toFixed(2)}
            </span>
          ) : null}
        </div>
      </button>

      {/* Cards grid */}
      {isOpen ? (
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <TrendCard
              key={String(t.id)}
              t={t}
              isOpen={Boolean(expanded[String(t.id)])}
              onToggle={() => onToggleExpand(t.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── Page component ──────────────────────────────────────────── */
export default function Page() {
  const now = useMemo(() => new Date(), []);
  const currentWeek = useMemo(() => getISOWeek(now), [now]);
  const previousWeek = useMemo(() => (currentWeek > 1 ? currentWeek - 1 : 52), [currentWeek]);

  /* Filter state */
  const [groupBy, setGroupBy] = useState<GroupBy>("week");
  const [selectedSlot, setSelectedSlot] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [minScore, setMinScore] = useState<number>(0.5);
  const [searchQuery, setSearchQuery] = useState<string>("");

  /* Dropdown open state */
  const [isSlotOpen, setIsSlotOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);

  /* Card / source-group expand state */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sourceGroupOpen, setSourceGroupOpen] = useState<Record<string, boolean>>({});

  /* Data state */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);

  /* ── Close dropdowns on outside click ───────────────────── */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (slotRef.current && !slotRef.current.contains(e.target as Node)) {
        setIsSlotOpen(false);
      }
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) {
        setIsCategoryOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* ── Data fetching (unchanged) ───────────────────────────── */
  const loadTrends = useCallback(async (background = false) => {
    if (!background) setLoading(true);
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
        "id, topic, category, relevance_score, summary, spotify_impact, url, published_date, week_number, newsletter_source"
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

    if (!background) setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTrends(false);

    const sb = supabase;
    if (!sb) return () => {};

    const channel = sb
      .channel("public:trends-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "trends" }, () => {
        if (active) void loadTrends(true);
      })
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

  /* ── Data transformation (unchanged) ────────────────────── */
  const normalizedTrends = useMemo(() => {
    return trends
      .map((t) => {
        const d = safeDate(t.published_date);
        return { ...t, week_number: t.week_number ?? (d ? getISOWeek(d) : null) };
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
          hasTopic || hasSummary || hasImpact || hasUrl || hasScore || hasCategory || hasDate || hasWeek
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
    for (const t of normalizedTrends) set.add(slotKeyForTrend(t, groupBy));
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedSlot("all");
  }, [groupBy]);

  /* filtered — includes search query */
  const filtered = useMemo(() => {
    const min = clamp01(minScore);
    const q = searchQuery.toLowerCase().trim();
    return normalizedTrends.filter((t) => {
      if ((t.relevance_score ?? 0) < min) return false;
      const category = (t.category ?? "").trim();
      if (selectedCategory !== "all" && category !== selectedCategory) return false;
      if (selectedSlot !== "all" && slotKeyForTrend(t, groupBy) !== selectedSlot) return false;
      if (q) {
        const matches =
          (t.topic ?? "").toLowerCase().includes(q) ||
          (t.summary ?? "").toLowerCase().includes(q) ||
          (t.category ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [groupBy, minScore, normalizedTrends, selectedCategory, selectedSlot, searchQuery]);

  const grouped = useMemo(() => {
    const map = new Map<string, Trend[]>();
    for (const t of filtered) {
      const label = slotLabelFromKey(slotKeyForTrend(t, groupBy), groupBy);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(t);
    }
    const labels = Array.from(map.keys());
    labels.sort((a, b) => {
      const aU = a.startsWith("Ohne"), bU = b.startsWith("Ohne");
      if (aU && !bU) return 1;
      if (!aU && bU) return -1;
      if (groupBy === "week") {
        return (Number(b.replace(/\D/g, "")) || 0) - (Number(a.replace(/\D/g, "")) || 0);
      }
      return b.localeCompare(a, "de-DE");
    });
    return labels.map((label) => ({ label, items: map.get(label) ?? [] }));
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
      Array.from(categoryCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "\u2014";
    const distHigh = filtered.filter((t) => (t.relevance_score ?? 0) >= 0.8).length;
    const distMid = filtered.filter(
      (t) => (t.relevance_score ?? 0) >= 0.6 && (t.relevance_score ?? 0) < 0.8
    ).length;
    const distLow = filtered.filter((t) => (t.relevance_score ?? 0) < 0.6).length;
    const bars = Array.from(categoryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value }));
    return { count, avgScore, topCategory, highPriority, distHigh, distMid, distLow, bars };
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
          hsl(0 72% 58%) 0% ${highPct}%,
          hsl(38 92% 50%) ${highPct}% ${highPct + midPct}%,
          hsl(141 73% 42%) ${highPct + midPct}% ${highPct + midPct + lowPct}%
        )`,
      } as React.CSSProperties,
    };
  }, [kpis.distHigh, kpis.distLow, kpis.distMid]);

  /* Active filter chips */
  const activeFilters = useMemo(() => {
    const chips: { label: string; onRemove: () => void }[] = [];
    if (selectedSlot !== "all")
      chips.push({ label: slotLabelFromKey(selectedSlot, groupBy), onRemove: () => setSelectedSlot("all") });
    if (selectedCategory !== "all")
      chips.push({ label: selectedCategory, onRemove: () => setSelectedCategory("all") });
    if (minScore > 0)
      chips.push({ label: `Score \u2265 ${clamp01(minScore).toFixed(2)}`, onRemove: () => setMinScore(0) });
    return chips;
  }, [selectedSlot, selectedCategory, minScore, groupBy]);

  /* KPI progress percentages */
  const activePct = normalizedTrends.length > 0 ? (kpis.count / normalizedTrends.length) * 100 : 0;
  const scorePct = kpis.avgScore !== null ? clamp01(kpis.avgScore) * 100 : 0;
  const highPct = kpis.count > 0 ? (kpis.highPriority / kpis.count) * 100 : 0;

  /* Stable callbacks */
  const toggleExpanded = useCallback((id: Trend["id"]) => {
    const key = String(id);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleSourceGroup = useCallback((key: string, defaultOpen: boolean) => {
    setSourceGroupOpen((prev) => ({
      ...prev,
      [key]: !(key in prev ? prev[key] : defaultOpen),
    }));
  }, []);

  /* Flat layout when searching or category-filtering (avoids fragmented results) */
  const useFlatLayout = Boolean(searchQuery.trim()) || selectedCategory !== "all";

  /* Slot label for current selection */
  const selectedSlotLabel =
    selectedSlot === "all"
      ? groupBy === "week"
        ? "Alle Wochen"
        : groupBy === "day"
          ? "Alle Tage"
          : "Alle Monate"
      : (slotOptions.find((s) => s.key === selectedSlot)?.label ?? selectedSlot);

  const selectedCategoryLabel = selectedCategory === "all" ? "Alle Kategorien" : selectedCategory;

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-background p-6 lg:p-10">
      {/* Ambient radial gradient */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(55%_45%_at_50%_0%,rgba(29,185,84,0.14),rgba(0,0,0,0))]" />

      <div className="mx-auto max-w-7xl space-y-6">

        {/* ── Header ─────────────────────────────────────────── */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary">
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-primary-foreground" fill="currentColor">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Spotify</p>
              <h1 className="text-2xl font-bold tracking-tight">Trend Radar</h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs text-secondary-foreground ring-1 ring-glass-border sm:flex">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Fresh Insights
          </div>
        </header>

        {/* ── Filter Bar ─────────────────────────────────────── */}
        <div className="glass-card p-5 space-y-5">

          {/* Row 1: time toggle + custom dropdowns */}
          <div className="flex flex-wrap items-end gap-4">

            {/* Time range toggle */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Zeitraum
              </span>
              <div className="flex gap-1 rounded-xl bg-secondary p-1">
                {(
                  [
                    ["week", "KW"],
                    ["day", "Tag"],
                    ["month", "Monat"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGroupBy(value)}
                    className={groupBy === value ? "filter-chip-active" : "filter-chip-inactive"}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Slot custom dropdown */}
            <div className="space-y-1.5" ref={slotRef}>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Auswahl
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setIsSlotOpen((v) => !v); setIsCategoryOpen(false); }}
                  className="flex h-11 min-w-[180px] items-center justify-between gap-3 rounded-xl bg-secondary px-4 text-sm text-foreground transition-colors hover:bg-glass-hover"
                >
                  <span className="truncate">{selectedSlotLabel}</span>
                  <ChevronDown
                    className={cx("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", isSlotOpen && "rotate-180")}
                  />
                </button>
                {isSlotOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1.5 min-w-full overflow-hidden rounded-xl border border-glass-border bg-glass shadow-xl backdrop-blur-xl">
                    <div className="max-h-60 overflow-y-auto py-1">
                      <button
                        type="button"
                        onClick={() => { setSelectedSlot("all"); setIsSlotOpen(false); }}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-glass-hover"
                      >
                        <span className={selectedSlot === "all" ? "text-primary" : ""}>
                          {groupBy === "week" ? "Alle Wochen" : groupBy === "day" ? "Alle Tage" : "Alle Monate"}
                        </span>
                        {selectedSlot === "all" && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                      {slotOptions.map((slot) => (
                        <button
                          key={slot.key}
                          type="button"
                          onClick={() => { setSelectedSlot(slot.key); setIsSlotOpen(false); }}
                          className="flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-glass-hover"
                        >
                          <span className={selectedSlot === slot.key ? "text-primary" : ""}>{slot.label}</span>
                          {selectedSlot === slot.key && <Check className="h-3.5 w-3.5 text-primary" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Category custom dropdown */}
            <div className="space-y-1.5" ref={categoryRef}>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Kategorie
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setIsCategoryOpen((v) => !v); setIsSlotOpen(false); }}
                  className="flex h-11 min-w-[200px] items-center justify-between gap-3 rounded-xl bg-secondary px-4 text-sm text-foreground transition-colors hover:bg-glass-hover"
                >
                  <span className="truncate">{selectedCategoryLabel}</span>
                  <ChevronDown
                    className={cx("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", isCategoryOpen && "rotate-180")}
                  />
                </button>
                {isCategoryOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1.5 min-w-full overflow-hidden rounded-xl border border-glass-border bg-glass shadow-xl backdrop-blur-xl">
                    <div className="max-h-60 overflow-y-auto py-1">
                      <button
                        type="button"
                        onClick={() => { setSelectedCategory("all"); setIsCategoryOpen(false); }}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-glass-hover"
                      >
                        <span className={selectedCategory === "all" ? "text-primary" : ""}>Alle Kategorien</span>
                        {selectedCategory === "all" && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                      {categories.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => { setSelectedCategory(c); setIsCategoryOpen(false); }}
                          className="flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-glass-hover"
                        >
                          <span className={selectedCategory === c ? "text-primary" : ""}>{c}</span>
                          {selectedCategory === c && <Check className="h-3.5 w-3.5 text-primary" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Score slider (full width) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Min. Relevanz Score
              </span>
              <span className="text-sm font-bold text-primary">{clamp01(minScore).toFixed(2)}</span>
            </div>
            {/* Slider wrapper with visual track + tooltip */}
            <div className="relative pt-7 pb-1">
              {/* Visual fill track */}
              <div className="pointer-events-none absolute left-0 right-0 top-7 h-2 -translate-y-px overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-150"
                  style={{ width: `${clamp01(minScore) * 100}%` }}
                />
              </div>
              {/* Range input */}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="score-slider relative"
              />
              {/* Floating value tooltip */}
              <div
                className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-bold text-primary ring-1 ring-glass-border transition-all duration-150"
                style={{ left: `clamp(14px, ${clamp01(minScore) * 100}%, calc(100% - 14px))` }}
              >
                {clamp01(minScore).toFixed(2)}
              </div>
            </div>
            {/* Axis labels */}
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0.00</span>
              <span>1.00</span>
            </div>
          </div>

          {/* Row 3: KW quickfilter (week mode only) */}
          {groupBy === "week" && slotOptions.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Schnellfilter KW
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSlot("all")}
                  className={selectedSlot === "all" ? "filter-chip-active" : "filter-chip-inactive"}
                >
                  Alle
                </button>
                {slotOptions.slice(0, 4).map((slot) => (
                  <button
                    key={slot.key}
                    type="button"
                    onClick={() => setSelectedSlot(slot.key)}
                    className={selectedSlot === slot.key ? "filter-chip-active" : "filter-chip-inactive"}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Row 4: Active filter chips + KW info */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {activeFilters.map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={f.onRemove}
                className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/30 transition-colors hover:bg-primary/25"
              >
                {f.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            <span className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2">
              <Calendar className="h-4 w-4" />
              Aktuelle KW:&nbsp;<strong className="text-foreground">KW {currentWeek}</strong>
            </span>
            <span className="inline-flex items-center rounded-xl bg-secondary px-4 py-2">
              Letzte KW:&nbsp;<strong className="text-foreground">KW {previousWeek}</strong>
            </span>
            <span className="ml-auto inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2">
              <Filter className="h-4 w-4" />
              <strong className="text-foreground">{filtered.length}</strong>&nbsp;Trends
            </span>
          </div>
        </div>

        {/* ── Search Bar ─────────────────────────────────────── */}
        <div className="glass-card flex items-center gap-3 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Trends durchsuchen\u2026"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {/* Search result hint */}
        {searchQuery.trim() ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">{filtered.length}</strong>&nbsp;Ergebnisse für&nbsp;
              <em className="text-foreground">&bdquo;{searchQuery.trim()}&ldquo;</em>
            </span>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-primary underline-offset-2 hover:underline"
            >
              Zurücksetzen
            </button>
          </div>
        ) : null}

        {/* ── KPI Cards ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Active Trends */}
          <div
            className="glass-card kpi-enter group relative p-6 transition-colors hover:border-primary/20"
            style={{ animationDelay: "0ms" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="kpi-label">Aktive Trends</span>
              <TrendingUp className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <span className="kpi-value">{kpis.count}</span>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${activePct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {Math.round(activePct)}% aller Trends
            </p>
          </div>

          {/* Avg Score */}
          <div
            className="glass-card kpi-enter group p-6 transition-colors hover:border-primary/20"
            style={{ animationDelay: "80ms" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="kpi-label">Durchschn. Score</span>
              <BarChart3 className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <span className="kpi-value text-primary">
              {kpis.avgScore === null ? "\u2014" : clamp01(kpis.avgScore).toFixed(2)}
            </span>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${scorePct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Relevanz-Durchschnitt
            </p>
          </div>

          {/* Top Category */}
          <div
            className="glass-card kpi-enter group p-6 transition-colors hover:border-primary/20"
            style={{ animationDelay: "160ms" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="kpi-label">Top Kategorie</span>
              <Award className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <span className="kpi-value text-3xl">{kpis.topCategory}</span>
            <div className="mt-4">
              {kpis.topCategory && kpis.topCategory !== "\u2014" ? (
                <span className={cx("category-badge ring-1 text-[11px]", categoryStyles(kpis.topCategory))}>
                  {kpis.topCategory}
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">Noch keine Daten</span>
              )}
            </div>
          </div>

          {/* High Priority */}
          <div
            className="glass-card kpi-enter group relative overflow-hidden p-6 transition-colors hover:border-score-high/20"
            style={{ animationDelay: "240ms" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="kpi-label">High Priority (&ge; 0.8)</span>
              <AlertTriangle className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-score-high" />
            </div>
            <span className="kpi-value text-score-high">{kpis.highPriority}</span>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-score-high transition-all duration-700"
                style={{ width: `${highPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {Math.round(highPct)}% der gefilterten Trends
            </p>
            {/* Ambient glow */}
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-score-high/10 blur-2xl" />
            {/* Pulsing ring when there are high-priority items */}
            {kpis.highPriority > 0 ? (
              <div className="animate-pulse pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-score-high/30" />
            ) : null}
          </div>
        </div>

        {/* ── Charts ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

          {/* Category Distribution */}
          <div className="glass-card p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-base font-semibold">Verteilung nach Kategorie</h3>
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-4">
              {kpis.bars.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Daten für Kategorie-Verteilung.</p>
              ) : (
                kpis.bars.map((bar) => {
                  const max = Math.max(...kpis.bars.map((x) => x.value), 1);
                  const pct = Math.max(4, (bar.value / max) * 100);
                  return (
                    <div key={bar.name} className="flex items-center gap-4">
                      <span className="w-40 shrink-0 truncate text-sm text-muted-foreground" title={bar.name}>
                        {bar.name}&nbsp;
                        <span className="font-medium text-foreground">({bar.value})</span>
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Relevance Donut */}
          <div className="glass-card p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-base font-semibold">Relevanz-Verteilung</h3>
              <Flame className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-6">
              <div className="relative h-[180px] w-[180px] flex-shrink-0">
                <div className="h-full w-full rounded-full" style={donutStyle.style} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="flex h-[110px] w-[110px] flex-col items-center justify-center rounded-full bg-glass text-center ring-1 ring-glass-border">
                    <span className="text-2xl font-bold">{donutStyle.total}</span>
                    <span className="text-xs text-muted-foreground">Trends</span>
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                {(
                  [
                    { label: "High (0.8+)", count: kpis.distHigh, dot: "bg-score-high", text: "text-score-high" },
                    { label: "Mid (0.6\u20130.79)", count: kpis.distMid, dot: "bg-score-mid", text: "text-score-mid" },
                    { label: "Low (<0.6)", count: kpis.distLow, dot: "bg-score-low", text: "text-score-low" },
                  ] as const
                ).map(({ label, count, dot, text }) => (
                  <div key={label} className="flex items-center justify-between rounded-xl bg-secondary px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                      <span className="text-sm">{label}</span>
                    </div>
                    <span className={`text-sm font-bold ${text}`}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Trend Cards / Source Groups ─────────────────────── */}
        <section className="space-y-6">
          {loading ? (
            <div className="glass-card flex items-center gap-3 p-6 text-secondary-foreground">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              <p>Trends werden geladen&hellip;</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-score-high/30 bg-score-high/10 p-6">
              <p className="font-semibold text-score-high">Fehler beim Laden</p>
              <p className="mt-1 text-sm text-score-high opacity-80">{error}</p>
            </div>
          ) : grouped.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <p className="text-muted-foreground">
                Keine Trends gefunden. Passe die Filter an.
              </p>
            </div>
          ) : (
            grouped.map(({ label, items }) => (
              <div key={label} className="space-y-3">
                {/* Time-slot heading */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{label}</h2>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Filter className="h-4 w-4" />
                    <span>{items.length} Trends</span>
                  </div>
                </div>

                {useFlatLayout ? (
                  /* Flat grid — used when searching or filtering by category */
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((t) => (
                      <TrendCard
                        key={String(t.id)}
                        t={t}
                        isOpen={Boolean(expanded[String(t.id)])}
                        onToggle={() => toggleExpanded(t.id)}
                      />
                    ))}
                  </div>
                ) : (
                  /* Source-grouped layout */
                  (() => {
                    const bySource = new Map<string, Trend[]>();
                    for (const t of items) {
                      const domain =
                        (t.url ?? "").trim()
                          ? extractDomain((t.url ?? "").trim())
                          : "Unbekannte Quelle";
                      if (!bySource.has(domain)) bySource.set(domain, []);
                      bySource.get(domain)!.push(t);
                    }
                    const sortedSources = Array.from(bySource.entries()).sort(
                      (a, b) => b[1].length - a[1].length
                    );
                    return (
                      <div className="space-y-1">
                        {sortedSources.map(([domain, sourceItems]) => {
                          const groupKey = `${label}::${domain}`;
                          const defaultOpen = sourceItems.length <= 3;
                          const isOpen =
                            groupKey in sourceGroupOpen
                              ? sourceGroupOpen[groupKey]
                              : defaultOpen;
                          return (
                            <SourceGroup
                              key={groupKey}
                              domain={domain}
                              items={sourceItems}
                              isOpen={isOpen}
                              onToggle={() => toggleSourceGroup(groupKey, defaultOpen)}
                              expanded={expanded}
                              onToggleExpand={toggleExpanded}
                            />
                          );
                        })}
                      </div>
                    );
                  })()
                )}
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
