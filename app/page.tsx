"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Award,
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Filter,
  Flame,
  LoaderCircle,
  RefreshCcw,
  Search,
  Sparkles,
  TrendingUp,
  X,
  Zap,
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
  source_page?: string | null;
  page?: string | null;
  page_number?: string | number | null;
  source?: string | null;
  source_name?: string | null;
  newsletter_source?: string | null;
};

type ExportScope = "all" | "month" | "week";
type SortOrder = "score-desc" | "score-asc" | "date-desc" | "category-asc";

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
  if (s >= 0.65) return "text-score-mid";
  return "text-score-low";
}

function scoreBgColor(score: number | null) {
  if (score === null || Number.isNaN(score)) return "bg-secondary";
  const s = clamp01(score);
  if (s >= 0.8) return "bg-score-high/20 ring-score-high/40";
  if (s >= 0.65) return "bg-score-mid/20 ring-score-mid/40";
  return "bg-score-low/20 ring-score-low/40";
}

function categoryStyles(category: string) {
  const key = category.toLowerCase();
  if (key.includes("spotify")) return "bg-[#1DB954]/20 text-[#35e06f] ring-[#1DB954]/40";
  if (key.includes("wettbewerb") || key.includes("competition"))
    return "bg-score-high/20 text-score-high ring-score-high/40";
  if (key.includes("marketing") || key.includes("markt"))
    return "bg-sky-500/20 text-sky-300 ring-sky-500/40";
  if (key.includes("audio") && !key.includes("hörbuch") && !key.includes("audiobook"))
    return "bg-violet-500/20 text-violet-300 ring-violet-500/40";
  if (key.includes("podcast") || key.includes("content"))
    return "bg-cyan-500/20 text-cyan-300 ring-cyan-500/40";
  if (key.includes("creator"))
    return "bg-orange-500/20 text-orange-300 ring-orange-500/40";
  if (key.includes("consumer"))
    return "bg-slate-400/20 text-slate-300 ring-slate-400/40";
  if (key.includes("hörbuch") || key.includes("hoerbuch") || key.includes("audiobook"))
    return "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40";
  return "bg-secondary text-secondary-foreground ring-glass-border";
}

function categoryBorderColor(category: string) {
  const key = category.toLowerCase();
  if (key.includes("spotify")) return "ring-[#1DB954]/60";
  if (key.includes("wettbewerb") || key.includes("competition")) return "ring-score-high/60";
  if (key.includes("marketing") || key.includes("markt")) return "ring-sky-500/60";
  if (key.includes("audio") && !key.includes("hörbuch") && !key.includes("audiobook"))
    return "ring-violet-500/60";
  if (key.includes("podcast") || key.includes("content")) return "ring-cyan-500/60";
  if (key.includes("creator")) return "ring-orange-500/60";
  if (key.includes("consumer")) return "ring-slate-400/60";
  if (key.includes("hörbuch") || key.includes("hoerbuch") || key.includes("audiobook"))
    return "ring-emerald-500/60";
  return "ring-glass-border";
}

function slotKeyForTrend(t: Trend) {
  return t.week_number ? `week:${t.week_number}` : "week:unknown";
}

function slotLabelFromKey(key: string) {
  if (key.endsWith(":unknown")) return "Ohne KW";
  const raw = key.split(":")[1] ?? "";
  return `KW ${raw}`;
}

function compactText(text: string, len: number) {
  const cleaned = text.trim();
  if (cleaned.length <= len) return cleaned;
  return `${cleaned.slice(0, len).trimEnd()}\u2026`;
}

function inferPageReference(t: Trend): string | null {
  const direct = [t.source_page, t.page, t.page_number]
    .map((v) => (v ?? "").toString().trim())
    .find(Boolean);
  if (direct) return direct.startsWith("S.") ? direct : `S. ${direct.replace(/^S\.?\s*/i, "")}`;

  const text = [t.summary, t.topic, t.url].filter(Boolean).join(" ");
  const fromText = text.match(/\bS\.?\s*(\d{1,3})\b/i) ?? text.match(/\bSeite\s*(\d{1,3})\b/i);
  if (fromText?.[1]) return `S. ${fromText[1]}`;

  const fromUrl = (t.url ?? "").match(/[?&](?:page|p|seite)=(\d{1,3})/i);
  if (fromUrl?.[1]) return `S. ${fromUrl[1]}`;

  return null;
}

function inferNewsletterSource(t: Trend): string {
  const src = (t.newsletter_source ?? "").trim();
  if (src) return src;
  const rawUrl = (t.url ?? "").trim();
  if (!rawUrl) return "Newsletter";
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return rawUrl.slice(0, 40) || "Unbekannte Quelle";
  }
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
  const isTrendOne = newsletterSource === "TrendOne";
  const pageRef = inferPageReference(t);
  const title = topic || (summary ? compactText(summary, 75) : "Trend ohne Titel");

  return (
    <article className="glass-card-hover flex flex-col p-5">
      {/* Top row: category badge + score + date */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={cx("category-badge ring-1", categoryStyles(category))}>
            {category}
          </span>
          {score !== null ? (
            <span className={cx("score-badge ring-1", scoreColor(score), scoreBgColor(score))}>
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
      <h3 className="mb-3 text-base font-semibold leading-snug">{title}</h3>

      {/* Relevant Because — ALWAYS visible */}
      {impact ? (
        <div className="mb-3 rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-3 py-2.5">
          <div className="mb-1 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-[#1DB954]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#1DB954]">
              Relevant Because
            </span>
          </div>
          <p className="text-sm leading-relaxed text-secondary-foreground">{impact}</p>
        </div>
      ) : null}

      {/* Source line — always visible */}
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium">Quelle:</span>
        {isTrendOne ? (
          <span className="text-secondary-foreground">
            TrendOne{pageRef ? ` \u2014 ${pageRef}` : ""}
          </span>
        ) : url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {newsletterSource} <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-secondary-foreground">{newsletterSource}</span>
        )}
      </div>

      {/* Details toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="mt-auto flex items-center gap-1 text-sm font-medium text-primary"
      >
        <span>{isOpen ? "Weniger anzeigen" : "Details anzeigen"}</span>
        <ChevronDown
          className={cx("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")}
        />
      </button>

      {/* Expanded: summary */}
      {isOpen ? (
        <div className="mt-3 space-y-3 border-t border-glass-border pt-3">
          {summary ? (
            <p className="text-sm leading-6 text-secondary-foreground">{summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Keine weiteren Details verfügbar.</p>
          )}
        </div>
      ) : null}
    </article>
  );
}

/* ── Page component ──────────────────────────────────────────── */
export default function Page() {
  const now = useMemo(() => new Date(), []);
  const currentWeek = useMemo(() => getISOWeek(now), [now]);
  const previousWeek = useMemo(() => (currentWeek > 1 ? currentWeek - 1 : 52), [currentWeek]);

  /* Filter state — default to current KW */
  const [selectedSlot, setSelectedSlot] = useState<string>(() => `week:${getISOWeek(new Date())}`);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [minScore, setMinScore] = useState<number>(0.5);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("score-desc");
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* Card expand state */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  /* Data state */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  /* Export state */
  const [exportScope, setExportScope] = useState<ExportScope>("all");
  const [exportMonth, setExportMonth] = useState<string>("all");
  const [exportWeek, setExportWeek] = useState<string>("all");
  const [exporting, setExporting] = useState(false);

  /* ── Data fetching ───────────────────────────────────────── */
  const loadTrends = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    if (background) setRefreshing(true);
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
        "id, topic, category, relevance_score, summary, spotify_impact, url, published_date, week_number, newsletter_source, page_number"
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

  /* ── Data transformation ────────────────────────────────── */
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
    for (const t of normalizedTrends) set.add(slotKeyForTrend(t));
    const keys = Array.from(set);
    keys.sort((a, b) => {
      if (a.endsWith(":unknown") && !b.endsWith(":unknown")) return 1;
      if (!a.endsWith(":unknown") && b.endsWith(":unknown")) return -1;
      const av = a.split(":")[1] ?? "";
      const bv = b.split(":")[1] ?? "";
      return Number(bv) - Number(av);
    });
    return keys.map((key) => ({ key, label: slotLabelFromKey(key) }));
  }, [normalizedTrends]);

  /* filtered — includes search query */
  const filtered = useMemo(() => {
    const min = clamp01(minScore);
    const q = searchQuery.toLowerCase().trim();
    return normalizedTrends.filter((t) => {
      if ((t.relevance_score ?? 0) < min) return false;
      const category = (t.category ?? "").trim();
      if (selectedCategory !== "all" && category !== selectedCategory) return false;
      if (selectedSlot !== "all" && slotKeyForTrend(t) !== selectedSlot) return false;
      if (q) {
        const matches =
          (t.topic ?? "").toLowerCase().includes(q) ||
          (t.summary ?? "").toLowerCase().includes(q) ||
          (t.category ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [minScore, normalizedTrends, selectedCategory, selectedSlot, searchQuery]);

  /* sorted filtered — default by score descending */
  const sortedFiltered = useMemo(() => {
    const arr = [...filtered];
    if (sortOrder === "score-desc")
      arr.sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
    else if (sortOrder === "score-asc")
      arr.sort((a, b) => (a.relevance_score ?? 0) - (b.relevance_score ?? 0));
    else if (sortOrder === "date-desc")
      arr.sort((a, b) => (b.published_date ?? "").localeCompare(a.published_date ?? ""));
    else if (sortOrder === "category-asc")
      arr.sort((a, b) => (a.category ?? "").localeCompare(b.category ?? ""));
    return arr;
  }, [filtered, sortOrder]);

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

  const exportData = useMemo(() => {
    let rows = filtered;
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
  }, [exportMonth, exportScope, exportWeek, filtered]);

  /* ── Excel Export — new column structure ─────────────────── */
  const handleExcelExport = useCallback(async () => {
    if (exportData.length === 0 || exporting) return;
    setExporting(true);
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Spotify Trends");

      const colCount = 10;
      ws.columns = [
        { key: "kw", width: 6 },
        { key: "datum", width: 14 },
        { key: "score", width: 8 },
        { key: "category", width: 22 },
        { key: "topic", width: 50 },
        { key: "relevantBecause", width: 55 },
        { key: "summary", width: 75 },
        { key: "quelle", width: 20 },
        { key: "seite", width: 10 },
        { key: "link", width: 50 },
      ];

      ws.mergeCells("A1:J1");
      ws.mergeCells("A2:J2");
      ws.getCell("A1").value = "SPOTIFY TREND RADAR";
      ws.getCell("A2").value = `Export vom ${new Date().toLocaleDateString("de-DE")} | Gefilterte Trends`;

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
        for (let c = 1; c <= colCount; c += 1) {
          const cell = row.getCell(c);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkHeader } };
          cell.font = { color: { argb: white }, bold: rowN === 1, size: rowN === 1 ? 14 : 10 };
          cell.alignment = { vertical: "middle", horizontal: rowN === 1 ? "center" : "left" };
        }
      }

      const headers = [
        "KW", "Datum", "Score", "Kategorie", "Topic",
        "Relevant Because", "Summary", "Quelle", "Seite", "Link",
      ];
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
        const d = safeDate(t.published_date);
        const kw = t.week_number ?? (d ? getISOWeek(d) : "");
        const datum = d
          ? `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`
          : "";
        const score =
          typeof t.relevance_score === "number"
            ? Number(clamp01(t.relevance_score).toFixed(2))
            : null;
        const src = inferNewsletterSource(t);
        const isTrendOne = src === "TrendOne";
        const pageRef = isTrendOne ? (inferPageReference(t) ?? "") : "";
        const link = !isTrendOne ? (t.url ?? "") : "";

        r.getCell(1).value = kw || "";
        r.getCell(2).value = datum;
        r.getCell(3).value = score;
        r.getCell(4).value = (t.category ?? "").trim();
        r.getCell(5).value = (t.topic ?? "").trim().toUpperCase();
        r.getCell(6).value = (t.spotify_impact ?? "").trim();
        r.getCell(7).value = (t.summary ?? "").trim();
        r.getCell(8).value = src;
        r.getCell(9).value = pageRef;
        r.getCell(10).value = link;

        r.getCell(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: lightGreen },
        };
        r.getCell(3).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: lightGreen },
        };
        r.getCell(3).numFmt = "0.00";
        r.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
        r.getCell(3).alignment = { vertical: "middle", horizontal: "center" };

        for (let c = 2; c <= colCount; c += 1) {
          if (c === 3) continue;
          const cell = r.getCell(c);
          cell.font = { color: { argb: black }, size: 10 };
          cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
        }
      });

      const maxRow = Math.max(4, 4 + exportData.length);
      for (let r = 4; r <= maxRow; r += 1) {
        for (let c = 1; c <= colCount; c += 1) {
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
      const filename = `Spotify_Trend_Radar_${scopePart}.xlsx`;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(dlUrl);
    } finally {
      setExporting(false);
    }
  }, [exportData, exportMonth, exportScope, exportWeek, exporting]);

  /* ── KPIs (always based on filtered data) ───────────────── */
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
    const highPctVal = (kpis.distHigh / total) * 100;
    const midPctVal = (kpis.distMid / total) * 100;
    const lowPctVal = (kpis.distLow / total) * 100;
    return {
      total: kpis.distHigh + kpis.distMid + kpis.distLow,
      style: {
        background: `conic-gradient(
          hsl(0 72% 58%) 0% ${highPctVal}%,
          hsl(38 92% 50%) ${highPctVal}% ${highPctVal + midPctVal}%,
          hsl(141 73% 42%) ${highPctVal + midPctVal}% ${highPctVal + midPctVal + lowPctVal}%
        )`,
      } as React.CSSProperties,
    };
  }, [kpis.distHigh, kpis.distLow, kpis.distMid]);

  /* KPI progress percentages */
  const activePct = normalizedTrends.length > 0 ? (kpis.count / normalizedTrends.length) * 100 : 0;
  const scorePct = kpis.avgScore !== null ? clamp01(kpis.avgScore) * 100 : 0;
  const highPct = kpis.count > 0 ? (kpis.highPriority / kpis.count) * 100 : 0;

  /* Stable callbacks */
  const toggleExpanded = useCallback((id: Trend["id"]) => {
    const key = String(id);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /* Slot label for header */
  const selectedSlotLabel =
    selectedSlot === "all"
      ? "Alle Wochen"
      : (slotOptions.find((s) => s.key === selectedSlot)?.label ?? selectedSlot);

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-background p-4 lg:p-8">
      {/* Ambient radial gradient */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(55%_45%_at_50%_0%,rgba(29,185,84,0.14),rgba(0,0,0,0))]" />

      <div className="mx-auto max-w-7xl space-y-5">

        {/* ── Header ─────────────────────────────────────────── */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary">
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-primary-foreground" fill="currentColor">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Spotify</p>
              <h1 className="text-2xl font-bold tracking-tight">Trend Radar</h1>
              <p className="text-xs text-muted-foreground">Dein wöchentliches Audio-Intelligence-Briefing</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {refreshing && <RefreshCcw className="h-4 w-4 animate-spin text-muted-foreground" />}
            <button
              type="button"
              onClick={() => void loadTrends(true)}
              className="hidden items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs text-secondary-foreground ring-1 ring-glass-border transition hover:bg-glass-hover sm:inline-flex"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Aktualisieren
            </button>
            <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs text-secondary-foreground ring-1 ring-glass-border">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Fresh Insights
            </div>
          </div>
        </header>

        {/* ── Hero KPI strip ──────────────────────────────────── */}
        <div className="glass-card p-4">
          <div className="mb-3 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-foreground">{selectedSlotLabel}</span>
            <span className="text-xs text-muted-foreground">
              {"\u00B7"} {kpis.count} Trends
              {kpis.avgScore !== null ? ` \u00B7 \u00D8 Score ${clamp01(kpis.avgScore).toFixed(2)}` : ""}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Trends count */}
            <div
              className="glass-card kpi-enter p-4 transition-colors hover:border-primary/20"
              style={{ animationDelay: "0ms" }}
            >
              <div className="flex items-center justify-between">
                <span className="kpi-label">Trends</span>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="kpi-value mt-1 block">{kpis.count}</span>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${activePct}%` }}
                />
              </div>
            </div>

            {/* Avg Score */}
            <div
              className="glass-card kpi-enter p-4 transition-colors hover:border-primary/20"
              style={{ animationDelay: "60ms" }}
            >
              <div className="flex items-center justify-between">
                <span className="kpi-label">{"\u00D8"} Score</span>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="kpi-value mt-1 block text-primary">
                {kpis.avgScore === null ? "\u2014" : clamp01(kpis.avgScore).toFixed(2)}
              </span>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${scorePct}%` }}
                />
              </div>
            </div>

            {/* Top Category */}
            <div
              className="glass-card kpi-enter p-4 transition-colors hover:border-primary/20"
              style={{ animationDelay: "120ms" }}
            >
              <div className="flex items-center justify-between">
                <span className="kpi-label">Top Kategorie</span>
                <Award className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="mt-1 block truncate text-sm font-bold">{kpis.topCategory}</span>
              {kpis.topCategory && kpis.topCategory !== "\u2014" ? (
                <span
                  className={cx(
                    "mt-2 inline-flex category-badge ring-1 text-[10px]",
                    categoryStyles(kpis.topCategory)
                  )}
                >
                  {kpis.topCategory}
                </span>
              ) : null}
            </div>

            {/* High Priority */}
            <div
              className="glass-card kpi-enter relative overflow-hidden p-4 transition-colors hover:border-score-high/20"
              style={{ animationDelay: "180ms" }}
            >
              <div className="flex items-center justify-between">
                <span className="kpi-label">High {"\u2265"} 0.8</span>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="kpi-value mt-1 block text-score-high">{kpis.highPriority}</span>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-score-high transition-all duration-700"
                  style={{ width: `${highPct}%` }}
                />
              </div>
              {kpis.highPriority > 0 && (
                <div className="pointer-events-none absolute inset-0 animate-pulse rounded-2xl ring-1 ring-score-high/30" />
              )}
            </div>
          </div>
        </div>

        {/* ── Filter Bar (collapsible) ────────────────────────── */}
        <div className="glass-card overflow-hidden">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-glass-hover"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Filter</span>
              {(selectedSlot !== "all" || selectedCategory !== "all" || minScore > 0) && (
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                  aktiv
                </span>
              )}
            </div>
            {filtersOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {filtersOpen && (
            <div className="space-y-5 border-t border-glass-border px-5 pb-5 pt-4">

              {/* KW Quick filter buttons */}
              <div className="space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Kalenderwoche
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSlot("all")}
                    className={selectedSlot === "all" ? "filter-chip-active" : "filter-chip-inactive"}
                  >
                    Alle
                  </button>
                  {slotOptions.slice(0, 6).map((slot) => (
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

              {/* Category buttons with per-category colors */}
              <div className="space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Kategorie
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("all")}
                    className={selectedCategory === "all" ? "filter-chip-active" : "filter-chip-inactive"}
                  >
                    Alle
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedCategory(c)}
                      className={cx(
                        "cursor-pointer rounded-xl px-4 py-2 text-sm font-medium ring-1 transition-all duration-200",
                        selectedCategory === c
                          ? cx(categoryStyles(c))
                          : cx("bg-transparent text-secondary-foreground hover:bg-glass-hover", categoryBorderColor(c))
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Score slider — compact */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Min. Score
                  </span>
                  <div className="relative flex-1 pb-1 pt-6">
                    <div className="pointer-events-none absolute left-0 right-0 top-6 h-2 -translate-y-px overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-150"
                        style={{ width: `${clamp01(minScore) * 100}%` }}
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={minScore}
                      onChange={(e) => setMinScore(Number(e.target.value))}
                      className="score-slider relative"
                    />
                    <div
                      className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-bold text-primary ring-1 ring-glass-border transition-all duration-150"
                      style={{ left: `clamp(14px, ${clamp01(minScore) * 100}%, calc(100% - 14px))` }}
                    >
                      {clamp01(minScore).toFixed(2)}
                    </div>
                  </div>
                  <span className="w-10 text-right text-sm font-bold text-primary">
                    {clamp01(minScore).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Status line */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  Aktuelle KW: <strong className="text-foreground">KW {currentWeek}</strong>
                </span>
                <span>
                  Letzte KW: <strong className="text-foreground">KW {previousWeek}</strong>
                </span>
                {lastUpdated && (
                  <span className="ml-auto">
                    Zuletzt: {lastUpdated.toLocaleTimeString("de-DE")}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Excel Export ───────────────────────────────────── */}
        <div className="glass-card flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2 mr-1">
            <Download className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Excel Export</span>
          </div>

          <div className="relative">
            <select
              value={exportScope}
              onChange={(e) => setExportScope(e.target.value as ExportScope)}
              className="h-9 cursor-pointer appearance-none rounded-xl border border-glass-border bg-secondary px-3 pr-8 text-sm text-foreground outline-none transition focus:border-primary/60"
            >
              <option value="all">Alles</option>
              <option value="month">Nach Monat</option>
              <option value="week">Nach KW</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>

          {exportScope === "month" && (
            <div className="relative">
              <select
                value={exportMonth}
                onChange={(e) => setExportMonth(e.target.value)}
                className="h-9 cursor-pointer appearance-none rounded-xl border border-glass-border bg-secondary px-3 pr-8 text-sm text-foreground outline-none transition focus:border-primary/60"
              >
                <option value="all">Alle Monate</option>
                {exportMonths.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          )}

          {exportScope === "week" && (
            <div className="relative">
              <select
                value={exportWeek}
                onChange={(e) => setExportWeek(e.target.value)}
                className="h-9 cursor-pointer appearance-none rounded-xl border border-glass-border bg-secondary px-3 pr-8 text-sm text-foreground outline-none transition focus:border-primary/60"
              >
                <option value="all">Alle KWs</option>
                {exportWeeks.map((w) => (
                  <option key={w} value={String(w)}>KW {w}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          )}

          <span className="text-xs text-muted-foreground">
            {exportData.length} Zeilen
          </span>

          <button
            type="button"
            onClick={() => void handleExcelExport()}
            disabled={exporting || exportData.length === 0}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exportiere\u2026" : "Excel exportieren"}
          </button>
        </div>

        {/* ── Search Bar ─────────────────────────────────────── */}
        <div className="glass-card flex items-center gap-3 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={"Trends durchsuchen\u2026"}
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

        {/* ── Trend Cards — flat, sorted by score ─────────────── */}
        <section>
          {/* Section header with sort dropdown */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {selectedSlotLabel}&nbsp;
              <span className="text-sm font-normal text-muted-foreground">
                — {sortedFiltered.length} Trends
              </span>
            </h2>
            <div className="relative">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className="h-9 cursor-pointer appearance-none rounded-xl border border-glass-border bg-secondary px-3 pr-8 text-xs text-foreground outline-none transition focus:border-primary/60"
              >
                <option value="score-desc">Score (hoch → niedrig)</option>
                <option value="score-asc">Score (niedrig → hoch)</option>
                <option value="date-desc">Datum (neu → alt)</option>
                <option value="category-asc">Kategorie A–Z</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

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
          ) : sortedFiltered.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <p className="text-muted-foreground">
                Keine Trends gefunden. Passe die Filter an.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sortedFiltered.map((t) => (
                <TrendCard
                  key={String(t.id)}
                  t={t}
                  isOpen={Boolean(expanded[String(t.id)])}
                  onToggle={() => toggleExpanded(t.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
