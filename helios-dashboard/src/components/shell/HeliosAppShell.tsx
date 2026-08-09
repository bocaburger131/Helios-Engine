"use client";

import type { ReactNode } from "react";
import { DealProvider } from "@/components/shell/DealContext";
import HeliosSidebar from "@/components/shell/HeliosSidebar";

type Props = {
  children: ReactNode;
};

export default function HeliosAppShell({ children }: Props) {
  return (
    <DealProvider>
      <div className="flex min-h-screen w-full">
        <HeliosSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </DealProvider>
  );
}
