import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  getCurrentUser,
  getMyAccounts,
  getMyExpiringContracts,
  getMyProfile,
  getMySpendingSummary,
  getMySpendingTrend,
  type ExecutiveAccountRecord,
  type ExpiringContractRecord,
  type SpendingSummaryRecord,
  type SpendingTrendRecord,
  type UserProfile,
} from "../api/authApi";
import { getAssignedTickets, type TicketRecord } from "../api/ticketApi";
import { getMyVisits, type VisitRecord } from "../api/visitApi";
import { isExecutiveRole } from "../utils/roleCapabilities";

interface ExecutiveDataState {
  accounts: ExecutiveAccountRecord[];
  tickets: TicketRecord[];
  visits: VisitRecord[];
  profile: UserProfile | null;
  expiringContracts: ExpiringContractRecord[];
  spendingSummary: SpendingSummaryRecord | null;
  spendingTrend: SpendingTrendRecord[];
  loading: boolean;
  initialLoading: boolean;
  error: string;
  initialized: boolean;
}

interface ExecutiveDataContextValue extends ExecutiveDataState {
  refreshAll: () => Promise<void>;
  refreshTickets: () => Promise<void>;
  refreshVisits: () => Promise<void>;
  refreshAccounts: () => Promise<void>;
  refreshExpiringContracts: () => Promise<void>;
  refreshSpending: () => Promise<void>;
}

const defaultState: ExecutiveDataState = {
  accounts: [],
  tickets: [],
  visits: [],
  profile: null,
  expiringContracts: [],
  spendingSummary: null,
  spendingTrend: [],
  loading: false,
  initialLoading: false,
  error: "",
  initialized: false,
};

const ExecutiveDataContext = createContext<ExecutiveDataContextValue | null>(null);

// How long cached data is considered fresh. Revisiting an executive page within
// this window will reuse the cache instead of issuing fresh API calls.
const STALE_TIME_MS = 60_000;

export function ExecutiveDataProvider({ children }: { children: ReactNode }) {
  const currentUser = getCurrentUser();
  const isExecutive = isExecutiveRole(currentUser?.role);

  const [state, setState] = useState<ExecutiveDataState>(defaultState);
  const lastFetchedAtRef = useRef<number>(0);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const refreshAll = useCallback(async (): Promise<void> => {
    if (!isExecutive) return;
    if (inFlightRef.current) {
      return inFlightRef.current;
    }
    const run = (async () => {
      setState((prev) => ({
        ...prev,
        loading: true,
        initialLoading: prev.initialized ? false : true,
        error: "",
      }));
      try {
        const [accounts, tickets, visits, profile, expiringContracts, spendingSummary, spendingTrend] = await Promise.all([
          getMyAccounts().catch(() => [] as ExecutiveAccountRecord[]),
          getAssignedTickets().catch(() => [] as TicketRecord[]),
          getMyVisits().catch(() => [] as VisitRecord[]),
          getMyProfile().catch(() => null),
          getMyExpiringContracts(6).catch(() => [] as ExpiringContractRecord[]),
          getMySpendingSummary().catch(() => null),
          getMySpendingTrend(6).catch(() => [] as SpendingTrendRecord[]),
        ]);
        lastFetchedAtRef.current = Date.now();
        setState({
          accounts,
          tickets,
          visits,
          profile,
          expiringContracts,
          spendingSummary,
          spendingTrend,
          loading: false,
          initialLoading: false,
          error: "",
          initialized: true,
        });
      } catch (err: unknown) {
        setState((prev) => ({
          ...prev,
          loading: false,
          initialLoading: false,
          error: err instanceof Error ? err.message : "Failed to load executive data",
          initialized: true,
        }));
      }
    })();
    inFlightRef.current = run;
    try {
      await run;
    } finally {
      inFlightRef.current = null;
    }
  }, [isExecutive]);

  const refreshTickets = useCallback(async () => {
    if (!isExecutive) return;
    try {
      const tickets = await getAssignedTickets();
      setState((prev) => ({ ...prev, tickets }));
    } catch {
      // Keep existing tickets if refresh fails
    }
  }, [isExecutive]);

  const refreshVisits = useCallback(async () => {
    if (!isExecutive) return;
    try {
      const visits = await getMyVisits();
      setState((prev) => ({ ...prev, visits }));
    } catch {
      // ignore
    }
  }, [isExecutive]);

  const refreshAccounts = useCallback(async () => {
    if (!isExecutive) return;
    try {
      const accounts = await getMyAccounts();
      setState((prev) => ({ ...prev, accounts }));
    } catch {
      // ignore
    }
  }, [isExecutive]);

  const refreshExpiringContracts = useCallback(async () => {
    if (!isExecutive) return;
    try {
      const expiringContracts = await getMyExpiringContracts(6);
      setState((prev) => ({ ...prev, expiringContracts }));
    } catch {
      // ignore
    }
  }, [isExecutive]);

  const refreshSpending = useCallback(async () => {
    if (!isExecutive) return;
    try {
      const [spendingSummary, spendingTrend] = await Promise.all([
        getMySpendingSummary().catch(() => null),
        getMySpendingTrend(6).catch(() => [] as SpendingTrendRecord[]),
      ]);
      setState((prev) => ({ ...prev, spendingSummary, spendingTrend }));
    } catch {
      // ignore
    }
  }, [isExecutive]);

  // Initial fetch when an executive logs in / lands on the layout. Subsequent
  // navigations between executive pages will reuse this cache (until a manual
  // refresh or staleness expires).
  useEffect(() => {
    if (!isExecutive) return;
    const isFresh = state.initialized && Date.now() - lastFetchedAtRef.current < STALE_TIME_MS;
    if (isFresh) return;
    void refreshAll();
    // We only want to trigger this on mount / when the role flips to executive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExecutive]);

  const value = useMemo<ExecutiveDataContextValue>(
    () => ({
      ...state,
      refreshAll,
      refreshTickets,
      refreshVisits,
      refreshAccounts,
      refreshExpiringContracts,
      refreshSpending,
    }),
    [state, refreshAll, refreshTickets, refreshVisits, refreshAccounts, refreshExpiringContracts, refreshSpending],
  );

  return <ExecutiveDataContext.Provider value={value}>{children}</ExecutiveDataContext.Provider>;
}

export function useExecutiveData(): ExecutiveDataContextValue {
  const ctx = useContext(ExecutiveDataContext);
  if (!ctx) {
    throw new Error("useExecutiveData must be used within an ExecutiveDataProvider");
  }
  return ctx;
}
