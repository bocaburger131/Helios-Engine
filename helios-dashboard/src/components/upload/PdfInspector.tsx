"use client";

import { useEffect, useState } from "react";

type Props = {
  file: File | null;
  onClose: () => void;
};

export default function PdfInspector({ file, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const blobUrl = URL.createObjectURL(file);
    setUrl(blobUrl);
    return () => URL.revokeObjectURL(blobUrl);
  }, [file]);

  if (!file) {
    return (
      <div className="flex h-full flex-col p-4">
        <p className="text-sm font-medium text-slate-700">PDF Inspector</p>
        <p className="mt-2 text-xs text-slate-500">
          Select a staged file and click Preview to inspect here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--helios-border)] px-4 py-3">
        <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          Close
        </button>
      </div>
      {url && (
        <iframe
          src={url}
          title={file.name}
          className="min-h-0 flex-1 w-full border-0"
        />
      )}
    </div>
  );
}
