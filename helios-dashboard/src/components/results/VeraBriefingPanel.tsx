"use client";

import ReactMarkdown from "react-markdown";

type Props = {
  markdown: string | null;
};

export default function VeraBriefingPanel({ markdown }: Props) {
  if (!markdown) return null;

  return (
    <section className="helios-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">Vera underwriting briefing</h2>
      <div className="prose-vera mt-4 max-w-none text-slate-700">
        <ReactMarkdown
          components={{
            h2: ({ children }) => (
              <h3 className="mt-6 mb-2 text-base font-semibold text-slate-900 first:mt-0">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="mb-3 leading-relaxed text-slate-700">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="mb-4 list-disc space-y-1.5 pl-5">{children}</ul>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-slate-900">{children}</strong>
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </section>
  );
}
