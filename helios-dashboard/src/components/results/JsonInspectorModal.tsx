"use client";

type Props = {
  open: boolean;
  onClose: () => void;
  data: unknown;
  title?: string;
};

export default function JsonInspectorModal({ open, onClose, data, title }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-slate-900">{title ?? "Analysis JSON"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Close
          </button>
        </div>
        <pre className="overflow-auto p-4 font-mono text-xs text-slate-800">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}
