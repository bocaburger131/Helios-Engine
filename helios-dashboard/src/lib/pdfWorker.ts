/**
 * Configure pdf.js worker for react-pdf under Next.js App Router.
 * Import this once from client components that render Document/Page.
 * Uses react-pdf's bundled pdfjs version (CDN) so it matches the nested pdfjs-dist.
 */
import { pdfjs } from "react-pdf";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

export { pdfjs };
