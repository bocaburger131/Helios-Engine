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
  requestedLoanAmount: string;
  setDealId: (v: string) => void;
  setCompanyName: (v: string) => void;
  setStatedRevenue: (v: string) => void;
  setRequestedLoanAmount: (v: string) => void;
  hydrateFromApplicationContext: (ctx: {
    dealId?: string | null;
    companyName?: string | null;
    statedRevenue?: number | null;
    statedGAR?: number | null;
    annualRevenue?: number | null;
    requestedLoanAmount?: number | null;
  }) => void;
};

const DealContext = createContext<DealContextValue | null>(null);

export function DealProvider({ children }: { children: ReactNode }) {
  const [dealId, setDealId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [statedRevenue, setStatedRevenue] = useState("");
  const [requestedLoanAmount, setRequestedLoanAmount] = useState("");

  const hydrateFromApplicationContext = useCallback(
    (ctx: {
      dealId?: string | null;
      companyName?: string | null;
      statedRevenue?: number | null;
      statedGAR?: number | null;
      annualRevenue?: number | null;
      requestedLoanAmount?: number | null;
    }) => {
      if (ctx.dealId) setDealId(String(ctx.dealId));
      if (ctx.companyName) setCompanyName(String(ctx.companyName));
      const revenue =
        ctx.statedRevenue ?? ctx.statedGAR ?? ctx.annualRevenue ?? null;
      if (revenue != null && Number.isFinite(Number(revenue))) {
        setStatedRevenue(String(revenue));
      }
      if (
        ctx.requestedLoanAmount != null &&
        Number.isFinite(Number(ctx.requestedLoanAmount))
      ) {
        setRequestedLoanAmount(String(ctx.requestedLoanAmount));
      }
    },
    []
  );

  const value = useMemo(
    () => ({
      dealId,
      companyName,
      statedRevenue,
      requestedLoanAmount,
      setDealId,
      setCompanyName,
      setStatedRevenue,
      setRequestedLoanAmount,
      hydrateFromApplicationContext,
    }),
    [
      dealId,
      companyName,
      statedRevenue,
      requestedLoanAmount,
      hydrateFromApplicationContext,
    ]
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
