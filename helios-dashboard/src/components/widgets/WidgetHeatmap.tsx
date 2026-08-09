"use client";

import RiskHeatmap from "@/components/charts/RiskHeatmap";
import WidgetShell from "@/components/widgets/WidgetShell";
import type { HeliosStatementPayload } from "@/lib/analysisAdapter";

type Props = {
  payload: HeliosStatementPayload;
  minimized: boolean;
  onToggleMinimize: () => void;
  editable?: boolean;
  onCategoryClick?: (category: string) => void;
};

export default function WidgetHeatmap({
  payload,
  minimized,
  onToggleMinimize,
  editable = false,
  onCategoryClick,
}: Props) {
  return (
    <WidgetShell
      title="Fee Risk Heatmap"
      minimized={minimized}
      onToggleMinimize={onToggleMinimize}
      variant="results"
      editable={editable}
    >
      <RiskHeatmap
        payload={payload}
        embedded
        onCategoryClick={onCategoryClick}
      />
    </WidgetShell>
  );
}
