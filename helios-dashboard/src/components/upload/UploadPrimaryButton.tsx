"use client";

export type PrimaryActionMode = "upload" | "runAnalysis";

type Props = {
  mode: PrimaryActionMode;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export default function UploadPrimaryButton({ mode, busy, disabled, onClick }: Props) {
  const label =
    busy && mode === "upload"
      ? "Classifying…"
      : busy && mode === "runAnalysis"
        ? "Running analysis…"
        : mode === "runAnalysis"
          ? "Run Analysis"
          : "Upload & classify";

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className="helios-btn helios-btn-primary w-full sm:w-auto min-w-[180px]"
    >
      {label}
    </button>
  );
}
