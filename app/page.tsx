"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Award,
  BarChart3,
  Calendar,
  ChevronDown,
  Download,
  ExternalLink,
  Filter,
  Flame,
  LoaderCircle,
  RefreshCcw,
  Sparkles,
  TrendingUp,
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
};

type GroupBy = "week" | "day" | "month";
type ExportScope = "all" | "month" | "week";

/* ── Utility functions (data logic — unchanged) ──────────────── */
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

/** Maps score to design-token colour classes (aligned with spotify-pulse) */
function scoreColor(score: number | null) {
  if (score === null || Number.isNaN(score)) return "text-muted-foreground";
  const s = clamp01(score);
  if (s >= 0.8) return "text-score-high";
  if (s >= 0.6) return "text-score-mid";
  return "text-score-low";
}

/** Category badge colour classes */
function categoryStyles(category: string) {
  const key = category.toLowerCase();
  if (key.includes("spotify"))
    return "bg-[#1DB954]/20 text-[#35e06f] ring-[#1DB954]/40";
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

/* ── Page component ──────────────────────────────────────────── */
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
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [exportScope, setExportScope] = useState<ExportScope>("all");
  const [exportMonth, setExportMonth] = useState<string>("all");
  const [exportWeek, setExportWeek] = useState<string>("all");
  const [exporting, setExporting] = useState(false);

  /* ── Data fetching (unchanged) ───────────────────────────── */
  const loadTrends = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    if (background) setRefreshing(true);
    setError(null);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      if (!background) setLoading(false);
      if (background) setRefreshing(false);
      setError(
        "Supabase env vars fehlen. Bitte setze NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
      return;
    }

    if (!supabase) {
      if (!background) setLoading(false);
      if (background) setRefreshing(false);
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
      setLastUpdated(new Date());
    }

    if (!background) setLoading(false);
    if (background) setRefreshing(false);
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
        return hasTopic || hasSummary || hasImpact || hasUrl || hasScore || hasCategory || hasDate || hasWeek;
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

  const exportMonths = useMemo(() => {
    const set = new Set<string>();
    for (const t of normalizedTrends) {
      const d = safeDate(t.published_date);
      if (d) set.add(monthKey(d));
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [normalizedTrends]);

  const exportWeeks = useMemo(() => {
    const set = new Set<number>();
    for (const t of normalizedTrends) {
      if (typeof t.week_number === "number" && t.week_number > 0) set.add(t.week_number);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [normalizedTrends]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedSlot("all");
  }, [groupBy]);

  const filtered = useMemo(() => {
    const min = clamp01(minScore);
    return normalizedTrends.filter((t) => {
      if ((t.relevance_score ?? 0) < min) return false;
      const category = (t.category ?? "").trim();
      if (selectedCategory !== "all" && category !== selectedCategory) return false;
      if (selectedSlot !== "all" && slotKeyForTrend(t, groupBy) !== selectedSlot) return false;
      return true;
    });
  }, [groupBy, minScore, normalizedTrends, selectedCategory, selectedSlot]);

  const exportData = useMemo(() => {
    let rows = normalizedTrends;
    if (exportScope === "month" && exportMonth !== "all") {
      rows = rows.filter((t) => {
        const d = safeDate(t.published_date);
        return d ? monthKey(d) === exportMonth : false;
      });
    }
    if (exportScope === "week" && exportWeek !== "all") {
      rows = rows.filter((t) => String(t.week_number ?? "") === exportWeek);
    }
    return rows;
  }, [exportMonth, exportScope, exportWeek, normalizedTrends]);

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

  const toggleExpanded = (id: Trend["id"]) => {
    const key = String(id);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExcelExport = useCallback(async () => {
    if (exportData.length === 0 || exporting) return;
    setExporting(true);

    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Spotify Trends");

      ws.columns = [
        { key: "score", width: 8 },
        { key: "category", width: 22 },
        { key: "topic", width: 50 },
        { key: "relevance", width: 35 },
        { key: "summary", width: 75 },
        { key: "source", width: 20 },
        { key: "page", width: 12 },
      ];

      ws.mergeCells("A1:G1");
      ws.mergeCells("A2:G2");
      ws.getCell("A1").value = "SPOTIFY TRENDONE-ANALYSE";
      ws.getCell("A2").value =
        "Quelle: TRENDONE Executive Trendreport 02/2026 | Zeitraum: Februar 2026";

      ws.getRow(1).height = 25;
      ws.getRow(2).height = 20;
      ws.getRow(3).height = 15;
      ws.getRow(4).height = 30;

      const darkHeader = "FF191414";
      const spotifyGreen = "FF1DB954";
      const white = "FFFFFFFF";
      const lightGreen = "FFC8E6C9";
      const black = "FF000000";

      for (const rowN of [1, 2]) {
        const row = ws.getRow(rowN);
        for (let c = 1; c <= 7; c += 1) {
          const cell = row.getCell(c);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkHeader } };
          cell.font = { color: { argb: white }, bold: rowN === 1, size: rowN === 1 ? 14 : 10 };
          cell.alignment = { vertical: "middle", horizontal: rowN === 1 ? "center" : "left" };
        }
      }

      const headers = ["Score", "Kategorie", "Topic", "Spotify-Relevanz", "Zusammenfassung", "Quelle", "Seite"];
      const headerRow = ws.getRow(4);
      headers.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = h;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: spotifyGreen } };
        cell.font = { color: { argb: white }, bold: true, size: 11 };
        cell.alignment = { vertical: "middle", horizontal: "left" };
      });

      exportData.forEach((t, idx) => {
        const r = ws.getRow(5 + idx);
        r.height = 65;
        const score = typeof t.relevance_score === "number" ? Number(clamp01(t.relevance_score).toFixed(2)) : null;
        const category = (t.category ?? "").trim();
        const topic = (t.topic ?? "").trim().toUpperCase();
        const relevance = (t.spotify_impact ?? "").trim();
        const summary = (t.summary ?? "").trim();

        r.getCell(1).value = score;
        r.getCell(2).value = category || "";
        r.getCell(3).value = topic || "";
        r.getCell(4).value = relevance || "";
        r.getCell(5).value = summary || "";
        r.getCell(6).value = "TRENDONE 02/2026";
        r.getCell(7).value = "S. -";

        r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightGreen } };
        r.getCell(1).numFmt = "0.00";
        r.getCell(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };

        for (let c = 2; c <= 7; c += 1) {
          const cell = r.getCell(c);
          cell.font = { color: { argb: black }, size: 10 };
          cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
        }
      });

      const maxRow = Math.max(4, 4 + exportData.length);
      for (let r = 4; r <= maxRow; r += 1) {
        for (let c = 1; c <= 7; c += 1) {
          ws.getCell(r, c).border = {
            top: { style: "thin", color: { argb: "FFD9D9D9" } },
            bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
            left: { style: "thin", color: { argb: "FFD9D9D9" } },
            right: { style: "thin", color: { argb: "FFD9D9D9" } },
          };
        }
      }

      const scopePart =
        exportScope === "all"
          ? "alles"
          : exportScope === "month"
            ? `monat-${exportMonth === "all" ? "alle" : exportMonth}`
            : `kw-${exportWeek === "all" ? "alle" : exportWeek}`;
      const filename = `Spotify_TRENDONE_Analyse_${scopePart}.xlsx`;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [exportData, exportMonth, exportScope, exportWeek, exporting]);

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-background p-6 lg:p-10">
      {/* Ambient Spotify-green radial gradient */}
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
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Spotify
              </p>
              <h1 className="text-2xl font-bold tracking-tight">Trend Radar</h1>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs text-secondary-foreground ring-1 ring-glass-border sm:flex">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Fresh Insights
          </div>
        </header>

        {/* ── Filter Bar ─────────────────────────────────────── */}
        <div className="glass-card p-5">
          <div className="flex flex-wrap items-end gap-6">

            {/* Time range toggle */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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

            {/* Slot select */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Auswahl
              </span>
              <div className="relative">
                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  className="h-11 min-w-[180px] cursor-pointer appearance-none rounded-xl bg-secondary px-4 pr-10 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
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
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            {/* Category filter */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Kategorie
              </span>
              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="h-11 min-w-[200px] cursor-pointer appearance-none rounded-xl bg-secondary px-4 pr-10 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="all">Alle Kategorien</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            {/* Min score slider */}
            <div className="min-w-[200px] flex-1 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Min. Relevanz Score
                </span>
                <span className="text-sm font-bold text-primary">
                  {clamp01(minScore).toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary
                  [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-lg"
              />
            </div>
          </div>

          {/* KW info badges */}
          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2">
              <Calendar className="h-4 w-4" />
              Aktuelle KW:&nbsp;
              <strong className="text-foreground">KW {currentWeek}</strong>
            </span>
            <span className="inline-flex items-center rounded-xl bg-secondary px-4 py-2">
              Letzte KW:&nbsp;
              <strong className="text-foreground">KW {previousWeek}</strong>
            </span>
            <span className="ml-auto inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2">
              <Filter className="h-4 w-4" />
              <strong className="text-foreground">{filtered.length}</strong>&nbsp;Trends
            </span>
            <button
              type="button"
              onClick={() => void loadTrends(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm text-muted-foreground transition hover:bg-glass-hover"
            >
              <RefreshCcw className={cx("h-4 w-4", refreshing && "animate-spin")} />
              Aktualisieren
            </button>
            {lastUpdated ? (
              <span className="text-xs text-muted-foreground">
                Zuletzt aktualisiert: {lastUpdated.toLocaleTimeString("de-DE")}
              </span>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-secondary/40 p-3">
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Export
              </span>
              <div className="relative">
                <select
                  value={exportScope}
                  onChange={(e) => setExportScope(e.target.value as ExportScope)}
                  className="h-10 min-w-[120px] cursor-pointer appearance-none rounded-xl bg-secondary px-3 pr-9 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="all">Alles</option>
                  <option value="month">Nach Monat</option>
                  <option value="week">Nach KW</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            {exportScope === "month" ? (
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Monat
                </span>
                <div className="relative">
                  <select
                    value={exportMonth}
                    onChange={(e) => setExportMonth(e.target.value)}
                    className="h-10 min-w-[150px] cursor-pointer appearance-none rounded-xl bg-secondary px-3 pr-9 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="all">Alle Monate</option>
                    {exportMonths.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
            ) : null}

            {exportScope === "week" ? (
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Kalenderwoche
                </span>
                <div className="relative">
                  <select
                    value={exportWeek}
                    onChange={(e) => setExportWeek(e.target.value)}
                    className="h-10 min-w-[120px] cursor-pointer appearance-none rounded-xl bg-secondary px-3 pr-9 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="all">Alle KWs</option>
                    {exportWeeks.map((w) => (
                      <option key={w} value={String(w)}>
                        KW {w}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void handleExcelExport()}
              disabled={exporting || exportData.length === 0}
              className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Exportiert..." : "Excel Export"}
            </button>
          </div>
        </div>

        {/* ── KPI Cards ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-card group p-6 transition-colors hover:border-primary/20">
            <div className="mb-3 flex items-center justify-between">
              <span className="kpi-label">Aktive Trends</span>
              <TrendingUp className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <span className="kpi-value">{kpis.count}</span>
          </div>

          <div className="glass-card group p-6 transition-colors hover:border-primary/20">
            <div className="mb-3 flex items-center justify-between">
              <span className="kpi-label">Durchschn. Score</span>
              <BarChart3 className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <span className="kpi-value text-primary">
              {kpis.avgScore === null ? "\u2014" : clamp01(kpis.avgScore).toFixed(2)}
            </span>
          </div>

          <div className="glass-card group p-6 transition-colors hover:border-primary/20">
            <div className="mb-3 flex items-center justify-between">
              <span className="kpi-label">Top Kategorie</span>
              <Award className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <span className="kpi-value text-3xl">{kpis.topCategory}</span>
          </div>

          <div className="glass-card group relative overflow-hidden p-6 transition-colors hover:border-score-high/20">
            <div className="mb-3 flex items-center justify-between">
              <span className="kpi-label">High Priority (&ge; 0.8)</span>
              <AlertTriangle className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-score-high" />
            </div>
            <span className="kpi-value text-score-high">{kpis.highPriority}</span>
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-score-high/10 blur-2xl" />
          </div>
        </div>

        {/* ── Charts ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

          {/* Category Distribution — horizontal bars */}
          <div className="glass-card p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-base font-semibold">Verteilung nach Kategorie</h3>
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-4">
              {kpis.bars.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Keine Daten für Kategorie-Verteilung.
                </p>
              ) : (
                kpis.bars.map((bar) => {
                  const max = Math.max(...kpis.bars.map((x) => x.value), 1);
                  const pct = Math.max(4, (bar.value / max) * 100);
                  return (
                    <div key={bar.name} className="flex items-center gap-4">
                      <span
                        className="w-40 shrink-0 truncate text-sm text-muted-foreground"
                        title={bar.name}
                      >
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

          {/* Relevance Distribution — donut */}
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
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-xl bg-secondary px-4 py-2.5"
                  >
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

        {/* ── Trend Cards ────────────────────────────────────── */}
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
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{label}</h2>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Filter className="h-4 w-4" />
                    <span>{items.length} Trends</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                        onClick={() => toggleExpanded(t.id)}
                        className="glass-card-hover p-5"
                      >
                        {/* Badge row */}
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className={cx("category-badge ring-1", categoryStyles(category))}>
                              {category}
                            </span>
                            {score !== null ? (
                              <span className={cx("score-badge", scoreColor(score))}>
                                {formatScore(score)}
                              </span>
                            ) : null}
                          </div>
                          {date ? (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {date.toLocaleDateString("de-DE")}
                            </span>
                          ) : null}
                        </div>

                        {/* Title */}
                        <h3 className="mb-2 text-base font-semibold leading-snug">{title}</h3>

                        {/* Preview (collapsed only) */}
                        {preview && !isOpen ? (
                          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                            {preview}
                          </p>
                        ) : null}

                        {/* Expand toggle */}
                        <div className="mt-3 flex items-center gap-1 text-sm font-medium text-primary">
                          <span>{isOpen ? "Weniger anzeigen" : "Details anzeigen"}</span>
                          <ChevronDown
                            className={cx(
                              "h-4 w-4 transition-transform duration-200",
                              isOpen && "rotate-180"
                            )}
                          />
                        </div>

                        {/* Expanded details */}
                        {isOpen ? (
                          <div className="mt-3 space-y-3 border-t border-glass-border pt-3">
                            {summary ? (
                              <p className="text-sm leading-6 text-secondary-foreground">
                                {summary}
                              </p>
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
