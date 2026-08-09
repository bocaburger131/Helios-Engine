"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Responsive, WidthProvider } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import WidgetCashFlowChart from "@/components/widgets/WidgetCashFlowChart";
import WidgetCategorizer from "@/components/widgets/WidgetCategorizer";
import WidgetFinancialVitals from "@/components/widgets/WidgetFinancialVitals";
import WidgetHeatmap from "@/components/widgets/WidgetHeatmap";
import WidgetRollingAverage from "@/components/widgets/WidgetRollingAverage";
import WidgetTelemetry from "@/components/widgets/WidgetTelemetry";
import WidgetVeraBriefing from "@/components/widgets/WidgetVeraBriefing";
import type { HeliosStatementPayload } from "@/lib/analysisAdapter";
import type { EnvelopeViewModel } from "@/lib/envelopeAdapter";
import type { TelemetryEvent } from "@/lib/parseTelemetryTimeline";
import type { CategorizerVitals } from "@/lib/recalcCategorizerVitals";
import {
  applyMinimizedToLayouts,
  clearWorkspaceState,
  filterLayoutsByVisibility,
  isWidgetVisible,
  loadWorkspaceState,
  MINIMIZED_H,
  PRESET_LAYOUTS,
  saveWorkspaceState,
  type GridLayoutItem,
  type GridLayouts,
  type PresetId,
  type WidgetId,
  type WorkspacePersisted,
} from "@/lib/workspaceLayout";

const ResponsiveGridLayout = WidthProvider(Responsive);

type Props = {
  payload: HeliosStatementPayload;
  view: EnvelopeViewModel;
  telemetryEvents: TelemetryEvent[];
  apiRef?: MutableRefObject<WorkspaceGridApi | null>;
  onSaved?: () => void;
  layoutEditMode?: boolean;
  visible?: Partial<Record<WidgetId, boolean>>;
  onVisibleChange?: (visible: Partial<Record<WidgetId, boolean>>) => void;
  onCategoryClick?: (category: string) => void;
};

export type WorkspaceGridApi = {
  saveNow: () => void;
  reset: () => void;
  applyPreset: (id: PresetId) => void;
  setWidgetVisible: (id: WidgetId, next: boolean) => void;
  getVisible: () => Partial<Record<WidgetId, boolean>>;
};

function toGridLayouts(raw: unknown): GridLayouts {
  if (!raw || typeof raw !== "object") return {};
  const out: GridLayouts = {};
  for (const [bp, items] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(items)) continue;
    out[bp] = items.map((item) => {
      const r = item as Record<string, unknown>;
      return {
        i: String(r.i ?? ""),
        x: Number(r.x) || 0,
        y: Number(r.y) || 0,
        w: Number(r.w) || 1,
        h: Number(r.h) || 1,
        minW: r.minW != null ? Number(r.minW) : undefined,
        minH: r.minH != null ? Number(r.minH) : undefined,
      } satisfies GridLayoutItem;
    });
  }
  return out;
}

export default function UnderwritingWorkspaceGrid({
  payload,
  view,
  telemetryEvents,
  apiRef,
  onSaved,
  layoutEditMode = false,
  visible: visibleProp,
  onVisibleChange,
  onCategoryClick,
}: Props) {
  const [layouts, setLayouts] = useState<GridLayouts>(() =>
    structuredClone(PRESET_LAYOUTS.default)
  );
  const [minimized, setMinimized] = useState<Partial<Record<WidgetId, boolean>>>(
    {}
  );
  const [expandedHeights, setExpandedHeights] = useState<
    Partial<Record<WidgetId, number>>
  >({});
  const [presetId, setPresetId] = useState<PresetId | null>("default");
  const [visibleInternal, setVisibleInternal] = useState<
    Partial<Record<WidgetId, boolean>>
  >({});
  const [hydrated, setHydrated] = useState(false);
  const [categorizerVitals, setCategorizerVitals] =
    useState<CategorizerVitals | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visible = visibleProp ?? visibleInternal;

  const setVisible = useCallback(
    (next: Partial<Record<WidgetId, boolean>>) => {
      if (onVisibleChange) onVisibleChange(next);
      else setVisibleInternal(next);
    },
    [onVisibleChange]
  );

  useEffect(() => {
    const stored = loadWorkspaceState();
    if (stored) {
      setLayouts(stored.layouts);
      setMinimized(stored.minimized || {});
      setExpandedHeights(stored.expandedHeights || {});
      setPresetId(stored.presetId);
      setVisible(stored.visible || {});
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once
  }, []);

  const persist = useCallback(
    (next: WorkspacePersisted) => {
      saveWorkspaceState(next);
      onSaved?.();
    },
    [onSaved]
  );

  const schedulePersist = useCallback(
    (next: WorkspacePersisted) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(next), 200);
    },
    [persist]
  );

  const buildState = useCallback(
    (
      nextLayouts: GridLayouts,
      nextMin: Partial<Record<WidgetId, boolean>>,
      nextHeights: Partial<Record<WidgetId, number>>,
      nextPreset: PresetId | null,
      nextVisible: Partial<Record<WidgetId, boolean>>
    ): WorkspacePersisted => ({
      layouts: nextLayouts,
      minimized: nextMin,
      expandedHeights: nextHeights,
      presetId: nextPreset,
      visible: nextVisible,
    }),
    []
  );

  const displayLayouts = useMemo(() => {
    const withMin = applyMinimizedToLayouts(layouts, minimized, expandedHeights);
    return filterLayoutsByVisibility(withMin, visible);
  }, [layouts, minimized, expandedHeights, visible]);

  const onLayoutChange = useCallback(
    (_current: unknown, all: unknown) => {
      if (!hydrated || !layoutEditMode) return;
      const incoming = toGridLayouts(all);
      const cleaned: GridLayouts = { ...layouts };
      for (const [bp, items] of Object.entries(incoming)) {
        const byId = new Map((layouts[bp] || []).map((x) => [x.i, x]));
        for (const item of items || []) {
          const id = item.i as WidgetId;
          if (minimized[id] && item.h <= MINIMIZED_H) {
            const prev = byId.get(id);
            byId.set(id, {
              ...item,
              h: expandedHeights[id] ?? prev?.h ?? 4,
            });
          } else {
            byId.set(id, { ...item });
          }
        }
        cleaned[bp] = Array.from(byId.values());
      }
      setLayouts(cleaned);
      setPresetId(null);
      schedulePersist(
        buildState(cleaned, minimized, expandedHeights, null, visible)
      );
    },
    [
      hydrated,
      layoutEditMode,
      minimized,
      layouts,
      expandedHeights,
      visible,
      schedulePersist,
      buildState,
    ]
  );

  const toggleMinimize = useCallback(
    (id: WidgetId) => {
      setMinimized((prev) => {
        const willMinimize = !prev[id];
        const nextMin = { ...prev, [id]: willMinimize };
        const nextHeights = { ...expandedHeights };
        if (willMinimize) {
          const lgItem = (layouts.lg || []).find((x) => x.i === id);
          if (lgItem && lgItem.h > MINIMIZED_H) {
            nextHeights[id] = lgItem.h;
          }
        }
        setExpandedHeights(nextHeights);
        schedulePersist(
          buildState(layouts, nextMin, nextHeights, presetId, visible)
        );
        return nextMin;
      });
    },
    [layouts, expandedHeights, presetId, visible, schedulePersist, buildState]
  );

  const setWidgetVisible = useCallback(
    (id: WidgetId, next: boolean) => {
      const nextVisible = { ...visible, [id]: next };
      setVisible(nextVisible);
      schedulePersist(
        buildState(layouts, minimized, expandedHeights, presetId, nextVisible)
      );
    },
    [
      visible,
      setVisible,
      layouts,
      minimized,
      expandedHeights,
      presetId,
      schedulePersist,
      buildState,
    ]
  );

  const saveNow = useCallback(() => {
    persist(buildState(layouts, minimized, expandedHeights, presetId, visible));
  }, [persist, buildState, layouts, minimized, expandedHeights, presetId, visible]);

  const reset = useCallback(() => {
    clearWorkspaceState();
    const next = structuredClone(PRESET_LAYOUTS.default);
    setLayouts(next);
    setMinimized({});
    setExpandedHeights({});
    setPresetId("default");
    setVisible({});
    persist(buildState(next, {}, {}, "default", {}));
  }, [persist, buildState, setVisible]);

  const applyPreset = useCallback(
    (id: PresetId) => {
      const next = structuredClone(PRESET_LAYOUTS[id]);
      setLayouts(next);
      setMinimized({});
      setExpandedHeights({});
      setPresetId(id);
      persist(buildState(next, {}, {}, id, visible));
    },
    [persist, buildState, visible]
  );

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      saveNow,
      reset,
      applyPreset,
      setWidgetVisible,
      getVisible: () => visible,
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, saveNow, reset, applyPreset, setWidgetVisible, visible]);

  if (!hydrated) {
    return (
      <div className="rounded-xl border border-results-border bg-results-bg p-8 text-sm text-results-text shadow-sm shadow-slate-200/50 dark:shadow-none">
        Loading workspace…
      </div>
    );
  }

  const show = (id: WidgetId) => isWidgetVisible(visible, id);

  return (
    <div className="underwriting-workspace-grid min-h-[480px] w-full">
      <ResponsiveGridLayout
        className="layout"
        layouts={displayLayouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4 }}
        rowHeight={36}
        margin={[16, 16]}
        compactType="vertical"
        draggableHandle=".widget-drag-handle"
        isDraggable={layoutEditMode}
        isResizable={layoutEditMode}
        onLayoutChange={onLayoutChange}
      >
        {show("vera") && (
          <div key="vera">
            <WidgetVeraBriefing
              markdown={view.veraBriefing}
              decision={view.veraDecision}
              score={view.veraScore}
              minimized={Boolean(minimized.vera)}
              onToggleMinimize={() => toggleMinimize("vera")}
              editable={layoutEditMode}
            />
          </div>
        )}
        {show("vitals") && (
          <div key="vitals">
            <WidgetFinancialVitals
              view={view}
              payload={payload}
              categorizerVitals={categorizerVitals}
              minimized={Boolean(minimized.vitals)}
              onToggleMinimize={() => toggleMinimize("vitals")}
              editable={layoutEditMode}
            />
          </div>
        )}
        {show("cashflow") && (
          <div key="cashflow">
            <WidgetCashFlowChart
              payload={payload}
              minimized={Boolean(minimized.cashflow)}
              onToggleMinimize={() => toggleMinimize("cashflow")}
              editable={layoutEditMode}
            />
          </div>
        )}
        {show("telemetry") && (
          <div key="telemetry">
            <WidgetTelemetry
              events={telemetryEvents}
              minimized={Boolean(minimized.telemetry)}
              onToggleMinimize={() => toggleMinimize("telemetry")}
              editable={layoutEditMode}
            />
          </div>
        )}
        {show("rolling") && (
          <div key="rolling">
            <WidgetRollingAverage
              payload={payload}
              minimized={Boolean(minimized.rolling)}
              onToggleMinimize={() => toggleMinimize("rolling")}
              editable={layoutEditMode}
            />
          </div>
        )}
        {show("heatmap") && (
          <div key="heatmap">
            <WidgetHeatmap
              payload={payload}
              minimized={Boolean(minimized.heatmap)}
              onToggleMinimize={() => toggleMinimize("heatmap")}
              editable={layoutEditMode}
              onCategoryClick={onCategoryClick}
            />
          </div>
        )}
        {show("categorizer") && (
          <div key="categorizer">
            <WidgetCategorizer
              payload={payload}
              minimized={Boolean(minimized.categorizer)}
              onToggleMinimize={() => toggleMinimize("categorizer")}
              editable={layoutEditMode}
              onVitalsChange={setCategorizerVitals}
            />
          </div>
        )}
      </ResponsiveGridLayout>
    </div>
  );
}
