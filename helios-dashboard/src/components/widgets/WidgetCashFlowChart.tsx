"use client";

import ForensicChart from "@/components/charts/ForensicChart";
import WidgetShell from "@/components/widgets/WidgetShell";
import type { HeliosStatementPayload } from "@/lib/analysisAdapter";

type Props = {
  payload: HeliosStatementPayload;
  minimized: boolean;
  onToggleMinimize: () => void;
  editable?: boolean;
};

export default function WidgetCashFlowChart({
  payload,
  minimized,
  onToggleMinimize,
  editable = false,
}: Props) {
  return (
    <WidgetShell
      title="Cash Flow"
      minimized={minimized}
      onToggleMinimize={onToggleMinimize}
      variant="results"
      editable={editable}
    >
      <div className="h-full min-h-[220px]">
        <ForensicChart
          payload={payload}
          defaultHorizon="l3m"
          compact
        />
      </div>
    </WidgetShell>
  );
}
