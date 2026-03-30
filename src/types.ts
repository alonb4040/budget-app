export type Conf = "high" | "med" | "low";

export interface Transaction {
  id: number | string;
  date: string;
  name: string;
  maxCat: string;
  amount: number;
  cat: string;
  conf: Conf;
  edited: boolean;
  originalCat: string;
  source: string;
  note?: string;
}

export interface Session {
  role: "admin" | "client";
  username: string;
  name?: string;
  id?: string;
}

export interface MonthEntry {
  id: string;
  client_id: string;
  month_key: string;
  label: string;
  is_finalized: boolean;
  created_at?: string;
}

export interface Submission {
  id: string;
  client_id: string;
  month_key: string;
  label: string;
  source_label: string;
  files: string[];
  transactions: Transaction[];
  is_finalized: boolean;
  created_at?: string;
}

export interface Client {
  id: string;
  username: string;
  password: string;
  name: string;
  email?: string;
  phone?: string;
  cycle_start_day: number;
  plan: "free" | "pro";
  portfolio_open: boolean;
  portfolio_opened_at?: string;
  submitted_at?: string;
  required_docs?: string[] | null;
  questionnaire_spouses?: number | null;
  created_at?: string;
}

export interface RememberedMapping {
  id: string;
  client_id: string;
  business_name: string;
  category: string;
}

export interface Payslip {
  id: string;
  client_id: string;
  label: string;
  month_key: string;
  filename: string;
  path: string;
  created_at?: string;
}

export interface ImportedTransaction {
  id: string;
  client_id: string;
  billing_month: string;
  date?: string;
  name: string;
  amount: number;
  cat: string;
  type: "income" | "expense";
  payment_method?: string;
  created_at?: string;
}

// הצהרה גלובלית עבור ספריות CDN
declare global {
  interface Window {
    XLSX: typeof import("xlsx");
    emailjs: {
      send: (
        serviceId: string,
        templateId: string,
        params: Record<string, string>,
        publicKey: string
      ) => Promise<void>;
    };
  }
}
