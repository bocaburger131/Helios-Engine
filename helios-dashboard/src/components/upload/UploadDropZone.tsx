"use client";

type Props = {
  files: File[];
  busy: boolean;
  compact?: boolean;
  onFiles: (list: FileList | null) => void;
  onPreview?: (file: File) => void;
};

export default function UploadDropZone({
  files,
  busy,
  compact,
  onFiles,
  onPreview,
}: Props) {
  return (
    <div
      className={`rounded-xl border-2 border-dashed transition ${
        files.length
          ? "border-emerald-300 bg-emerald-50/40"
          : "border-slate-200 bg-slate-50/50"
      } ${busy ? "pointer-events-none opacity-60" : ""} ${
        compact ? "px-4 py-6" : "px-6 py-10"
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onFiles(e.dataTransfer.files);
      }}
    >
      <p className="text-center text-sm font-medium text-slate-800">
        {files.length ? `${files.length} file(s) staged` : "Drop bank statement PDFs here"}
      </p>
      {!compact && (
        <p className="mt-1 text-center text-xs text-slate-500">
          Multiple files supported · auto-triage on add
        </p>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <label className="helios-btn helios-btn-secondary cursor-pointer">
          Browse files
          <input
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>
      </div>
      {files.length > 0 && (
        <ul className="mt-4 space-y-1">
          {files.map((f) => (
            <li
              key={f.name}
              className="flex items-center justify-between gap-2 rounded-lg bg-white/80 px-3 py-1.5 text-sm"
            >
              <span className="truncate font-mono text-xs text-slate-700">{f.name}</span>
              {onPreview && (
                <button
                  type="button"
                  onClick={() => onPreview(f)}
                  className="shrink-0 text-xs text-blue-600 hover:underline"
                >
                  Preview
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
