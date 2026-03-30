import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import type { MonthEntry, Submission, RememberedMapping } from "../types";

// ── Query keys ────────────────────────────────────────────────────────────────
export const keys = {
  monthEntries:        (id: string) => ["monthEntries",        id] as const,
  submissions:         (id: string) => ["submissions",         id] as const,
  rememberedMappings:  (id: string) => ["rememberedMappings",  id] as const,
  client:              (id: string) => ["client",              id] as const,
  payslips:            (id: string) => ["payslips",            id] as const,
  portfolioMonths:     (id: string) => ["portfolioMonths",     id] as const,
  portfolioSubs:       (id: string) => ["portfolioSubs",       id] as const,
  importedTxs:         (id: string) => ["importedTxs",         id] as const,
  manualTxs:           (id: string) => ["manualTxs",           id] as const,
  clientDocs:          (id: string) => ["clientDocs",          id] as const,
  debts:               (id: string) => ["debts",               id] as const,
  aiInsights:          (id: string) => ["aiInsights",          id] as const,
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useMonthEntries(clientId: string) {
  return useQuery({
    queryKey: keys.monthEntries(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("month_entries")
        .select("*")
        .eq("client_id", clientId)
        .order("month_key", { ascending: false });
      if (error) throw error;
      return (data || []) as MonthEntry[];
    },
    staleTime: 30_000,
  });
}

export function useSubmissions(clientId: string) {
  return useQuery({
    queryKey: keys.submissions(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as Submission[];
    },
    staleTime: 30_000,
  });
}

export function useRememberedMappings(clientId: string) {
  return useQuery({
    queryKey: keys.rememberedMappings(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remembered_mappings")
        .select("*")
        .eq("client_id", clientId);
      if (error) throw error;
      const obj: Record<string, string> = {};
      ((data || []) as RememberedMapping[]).forEach(m => { obj[m.business_name] = m.category; });
      return obj;
    },
    staleTime: 60_000,
  });
}

export function useClientProfile(clientId: string) {
  return useQuery({
    queryKey: keys.client(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("portfolio_open,portfolio_opened_at,email,phone,cycle_start_day,plan,submitted_at,required_docs,questionnaire_spouses")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

export function usePayslips(clientId: string) {
  return useQuery({
    queryKey: keys.payslips(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payslips")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function usePortfolioMonths(clientId: string) {
  return useQuery({
    queryKey: keys.portfolioMonths(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolio_months")
        .select("*")
        .eq("client_id", clientId)
        .order("month_key", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function usePortfolioSubs(clientId: string) {
  return useQuery({
    queryKey: keys.portfolioSubs(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolio_submissions")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useImportedTxs(clientId: string) {
  return useQuery({
    queryKey: keys.importedTxs(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imported_transactions")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useManualTxs(clientId: string) {
  return useQuery({
    queryKey: keys.manualTxs(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manual_transactions")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useClientDocs(clientId: string) {
  return useQuery({
    queryKey: keys.clientDocs(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_documents")
        .select("*")
        .eq("client_id", clientId);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useDebts(clientId: string) {
  return useQuery({
    queryKey: keys.debts(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debts")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useAiInsights(clientId: string) {
  return useQuery({
    queryKey: keys.aiInsights(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_insights")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });
}

// ── Invalidation helper — call after any mutation ─────────────────────────────
export function useInvalidateClient(clientId: string) {
  const qc = useQueryClient();
  return (queryKey?: ReturnType<typeof keys[keyof typeof keys]>) => {
    if (queryKey) {
      qc.invalidateQueries({ queryKey });
    } else {
      // invalidate all queries for this client
      Object.values(keys).forEach(fn => {
        qc.invalidateQueries({ queryKey: fn(clientId) });
      });
    }
  };
}
