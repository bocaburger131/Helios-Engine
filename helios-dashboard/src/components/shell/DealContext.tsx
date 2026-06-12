"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DealContextValue = {
  dealId: string;
  companyName: string;
  statedRevenue: string;
  setDealId: (v: string) => void;
  setCompanyName: (v: string) => void;
  setStatedRevenue: (v: string) => void;
};

const DealContext = createContext<DealContextValue | null>(null);

export function DealProvider({ children }: { children: ReactNode }) {
  const [dealId, setDealId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [statedRevenue, setStatedRevenue] = useState("");

  const value = useMemo(
    () => ({
      dealId,
      companyName,
      statedRevenue,
      setDealId,
      setCompanyName,
      setStatedRevenue,
    }),
    [dealId, companyName, statedRevenue]
  );

  return <DealContext.Provider value={value}>{children}</DealContext.Provider>;
}

export function useDealContext(): DealContextValue {
  const ctx = useContext(DealContext);
  if (!ctx) {
    throw new Error("useDealContext must be used within DealProvider");
  }
  return ctx;
}

export function useDealContextOptional(): DealContextValue | null {
  return useContext(DealContext);
}
