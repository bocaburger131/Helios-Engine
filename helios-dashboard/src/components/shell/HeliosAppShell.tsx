"use client";

import type { ReactNode } from "react";
import { DealProvider } from "@/components/shell/DealContext";
import HeliosSidebar from "@/components/shell/HeliosSidebar";
import { VeraProvider } from "@/components/vera/VeraProvider";
import VeraFab from "@/components/vera/VeraFab";
import VeraDrawer from "@/components/vera/VeraDrawer";

type Props = {
  children: ReactNode;
  inspector?: ReactNode;
};

export default function HeliosAppShell({ children, inspector }: Props) {
  return (
    <DealProvider>
      <VeraProvider>
        <div className="flex min-h-screen w-full">
          <HeliosSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
          </div>
          {inspector && (
            <aside className="hidden w-[360px] shrink-0 border-l border-[var(--helios-border)] bg-white dark:bg-slate-900 xl:block">
              {inspector}
            </aside>
          )}
        </div>
        <VeraFab />
        <VeraDrawer />
      </VeraProvider>
    </DealProvider>
  );
}
