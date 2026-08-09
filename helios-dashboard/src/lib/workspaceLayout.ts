/**
 * Underwriting workspace grid layouts — localStorage persistence + presets.
 */

export const STORAGE_KEY = "helios_workspace_layout";

export type WidgetId =
  | "vera"
  | "vitals"
  | "cashflow"
  | "telemetry"
  | "categorizer"
  | "rolling"
  | "heatmap";

export const WIDGET_IDS: WidgetId[] = [
  "vera",
  "vitals",
  "cashflow",
  "telemetry",
  "categorizer",
  "rolling",
  "heatmap",
];

export const RESULTS_WIDGET_IDS: WidgetId[] = [
  "cashflow",
  "rolling",
  "heatmap",
  "vitals",
  "vera",
  "categorizer",
];

export const PROCESS_WIDGET_IDS: WidgetId[] = ["telemetry"];

export const WIDGET_LABELS: Record<WidgetId, string> = {
  vera: "Vera Briefing",
  vitals: "Financial Vitals",
  cashflow: "Cash Flow Chart",
  telemetry: "AI Audit Trail",
  categorizer: "Transaction Categorizer",
  rolling: "Rolling 3-Month Average",
  heatmap: "Fee Risk Heatmap",
};

export type PresetId = "default" | "underwriter" | "auditor" | "executive";

/** Compatible with react-grid-layout legacy Layout items. */
export type GridLayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  static?: boolean;
};

export type GridLayouts = Record<string, GridLayoutItem[]>;

export type WorkspacePersisted = {
  layouts: GridLayouts;
  minimized: Partial<Record<WidgetId, boolean>>;
  expandedHeights: Partial<Record<WidgetId, number>>;
  presetId: PresetId | null;
  /** Missing key => visible (true). */
  visible: Partial<Record<WidgetId, boolean>>;
};

const MINIMIZED_H = 2;

function cloneLayouts(layouts: GridLayouts): GridLayouts {
  const out: GridLayouts = {};
  for (const [bp, items] of Object.entries(layouts)) {
    out[bp] = (items || []).map((item) => ({ ...item }));
  }
  return out;
}

function withMeta(items: GridLayoutItem[]): GridLayoutItem[] {
  return items.map((item) => ({
    ...item,
    minW: item.minW ?? 3,
    minH: item.minH ?? 2,
  }));
}

/** Default / baseline — includes rolling + heatmap. */
export const DEFAULT_LG: GridLayoutItem[] = withMeta([
  { i: "vera", x: 0, y: 0, w: 6, h: 4, minW: 3, minH: 2 },
  { i: "vitals", x: 6, y: 0, w: 6, h: 4, minW: 3, minH: 2 },
  { i: "cashflow", x: 0, y: 4, w: 7, h: 8, minW: 4, minH: 4 },
  { i: "telemetry", x: 7, y: 4, w: 5, h: 8, minW: 3, minH: 4 },
  { i: "rolling", x: 0, y: 12, w: 6, h: 6, minW: 3, minH: 4 },
  { i: "heatmap", x: 6, y: 12, w: 6, h: 6, minW: 3, minH: 4 },
  { i: "categorizer", x: 0, y: 18, w: 12, h: 8, minW: 4, minH: 4 },
]);

const UNDERWRITER_LG: GridLayoutItem[] = withMeta([
  { i: "vera", x: 0, y: 0, w: 7, h: 6, minW: 3, minH: 2 },
  { i: "vitals", x: 7, y: 0, w: 5, h: 6, minW: 3, minH: 2 },
  { i: "cashflow", x: 0, y: 6, w: 8, h: 8, minW: 4, minH: 4 },
  { i: "telemetry", x: 8, y: 6, w: 4, h: 4, minW: 3, minH: 3 },
  { i: "rolling", x: 8, y: 10, w: 4, h: 4, minW: 3, minH: 3 },
  { i: "heatmap", x: 0, y: 14, w: 6, h: 5, minW: 3, minH: 4 },
  { i: "categorizer", x: 6, y: 14, w: 6, h: 5, minW: 3, minH: 3 },
]);

const AUDITOR_LG: GridLayoutItem[] = withMeta([
  { i: "telemetry", x: 0, y: 0, w: 5, h: 8, minW: 3, minH: 4 },
  { i: "categorizer", x: 5, y: 0, w: 7, h: 8, minW: 4, minH: 4 },
  { i: "heatmap", x: 0, y: 8, w: 6, h: 6, minW: 3, minH: 4 },
  { i: "rolling", x: 6, y: 8, w: 6, h: 6, minW: 3, minH: 4 },
  { i: "vera", x: 0, y: 14, w: 4, h: 4, minW: 3, minH: 2 },
  { i: "vitals", x: 4, y: 14, w: 4, h: 4, minW: 3, minH: 2 },
  { i: "cashflow", x: 8, y: 14, w: 4, h: 6, minW: 3, minH: 4 },
]);

const EXECUTIVE_LG: GridLayoutItem[] = withMeta([
  { i: "vera", x: 0, y: 0, w: 6, h: 7, minW: 3, minH: 2 },
  { i: "vitals", x: 6, y: 0, w: 6, h: 7, minW: 3, minH: 2 },
  { i: "cashflow", x: 0, y: 7, w: 8, h: 6, minW: 4, minH: 4 },
  { i: "rolling", x: 8, y: 7, w: 4, h: 6, minW: 3, minH: 3 },
  { i: "heatmap", x: 0, y: 13, w: 6, h: 3, minW: 3, minH: 2 },
  { i: "telemetry", x: 6, y: 13, w: 3, h: 3, minW: 2, minH: 2 },
  { i: "categorizer", x: 9, y: 13, w: 3, h: 3, minW: 2, minH: 2 },
]);

function stackForNarrow(lg: GridLayoutItem[], cols: number): GridLayoutItem[] {
  let y = 0;
  return lg.map((item) => {
    const w = Math.min(item.w, cols);
    const next = { ...item, x: 0, y, w, minW: Math.min(item.minW ?? 2, cols) };
    y += item.h;
    return next;
  });
}

function layoutsFromLg(lg: GridLayoutItem[]): GridLayouts {
  return {
    lg: lg.map((item) => ({ ...item })),
    md: lg.map((item) => ({
      ...item,
      w: Math.min(item.w, 10),
      minW: Math.min(item.minW ?? 3, 10),
    })),
    sm: stackForNarrow(lg, 6),
    xs: stackForNarrow(lg, 4),
  };
}

export const PRESET_LAYOUTS: Record<PresetId, GridLayouts> = {
  default: layoutsFromLg(DEFAULT_LG),
  underwriter: layoutsFromLg(UNDERWRITER_LG),
  auditor: layoutsFromLg(AUDITOR_LG),
  executive: layoutsFromLg(EXECUTIVE_LG),
};

export const PRESET_LABELS: Record<PresetId, string> = {
  default: "Default",
  underwriter: "Underwriter Focus",
  auditor: "Auditor Focus",
  executive: "Executive Summary",
};

export function isWidgetVisible(
  visible: Partial<Record<WidgetId, boolean>> | undefined,
  id: WidgetId
): boolean {
  return visible?.[id] !== false;
}

export function filterLayoutsByVisibility(
  layouts: GridLayouts,
  visible: Partial<Record<WidgetId, boolean>>
): GridLayouts {
  const out: GridLayouts = {};
  for (const [bp, items] of Object.entries(layouts)) {
    out[bp] = (items || []).filter((item) =>
      isWidgetVisible(visible, item.i as WidgetId)
    );
  }
  return out;
}

function isValidLayouts(layouts: unknown): layouts is GridLayouts {
  if (!layouts || typeof layouts !== "object") return false;
  const lg = (layouts as GridLayouts).lg;
  return Array.isArray(lg) && lg.length > 0;
}

export function mergeWithDefaults(layouts: GridLayouts): GridLayouts {
  const base = cloneLayouts(PRESET_LAYOUTS.default);
  for (const bp of Object.keys(base)) {
    const incoming = layouts[bp];
    if (!Array.isArray(incoming)) continue;
    const byId = new Map(incoming.map((item) => [item.i, item]));
    base[bp] = (base[bp] || []).map((def) => {
      const hit = byId.get(def.i);
      return hit ? { ...def, ...hit, i: def.i } : def;
    });
  }
  return base;
}

export function loadWorkspaceState(): WorkspacePersisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspacePersisted;
    if (!isValidLayouts(parsed.layouts)) return null;
    return {
      layouts: mergeWithDefaults(parsed.layouts),
      minimized: parsed.minimized || {},
      expandedHeights: parsed.expandedHeights || {},
      presetId: parsed.presetId ?? null,
      visible: parsed.visible || {},
    };
  } catch {
    return null;
  }
}

export function saveWorkspaceState(state: WorkspacePersisted): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function clearWorkspaceState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Apply minimized flags to layout heights. */
export function applyMinimizedToLayouts(
  layouts: GridLayouts,
  minimized: Partial<Record<WidgetId, boolean>>,
  expandedHeights: Partial<Record<WidgetId, number>>
): GridLayouts {
  const next = cloneLayouts(layouts);
  for (const bp of Object.keys(next)) {
    next[bp] = (next[bp] || []).map((item) => {
      const id = item.i as WidgetId;
      if (minimized[id]) {
        return { ...item, h: MINIMIZED_H, minH: 2 };
      }
      const restore = expandedHeights[id];
      if (restore != null && restore > MINIMIZED_H) {
        return { ...item, h: restore };
      }
      return item;
    });
  }
  return next;
}

export { MINIMIZED_H };
