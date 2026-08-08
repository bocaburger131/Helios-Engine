import { Suspense } from "react";
import UploadHubPage from "@/components/upload/UploadHubPage";

export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-slate-500">Loading Upload Hub…</div>
      }
    >
      <UploadHubPage />
    </Suspense>
  );
}
