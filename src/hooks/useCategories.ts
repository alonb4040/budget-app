import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabase";
import { CATEGORIES as FALLBACK_CATEGORIES } from "../data";
import type { CategoryRule } from "../data";

export interface CategoryRow {
  id: number;
  name: string;
  section: string;
  budget_type: 'הכנסה' | 'קבוע' | 'משתנה';
  keywords: string[];
  max_hints: string[];
  client_id: number | null;
  is_active: boolean;
  is_ignored: boolean;
  sort_order: number;
}

export interface CategoriesData {
  /** סקציות גלובליות (אדמין) בלבד — לטופס ה-select ול-CategoryPicker */
  sections: Record<string, string[]>;
  /** כל הקטגוריות האקטיביות — גלובליות + אישיות */
  allCats: string[];
  /** קטגוריות אישיות של הלקוח בלבד */
  clientCats: string[];
  /** קטגוריות שיש להתעלם מהן בסיכומים (is_ignored = true) */
  ignoredCats: Set<string>;
  /** קטגוריות הכנסה (budget_type = 'הכנסה') */
  incomeCats: Set<string>;
  /** קטגוריות קבועות (budget_type = 'קבוע') */
  fixedCats: Set<string>;
  /** rules לסיווג אוטומטי — keywords + max_hints לכל קטגוריה */
  rules: CategoryRule[];
  /** שורות גולמיות — לשימוש ב-CategoryManager */
  rows: CategoryRow[];
  /** האם הטעינה הסתיימה */
  ready: boolean;
  /** רענון ידני */
  reload: () => void;
}

export function useCategories(clientId?: number | string | null): CategoriesData {
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!error && data) {
      setRows(data as CategoryRow[]);
    }
    setReady(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── derived — useMemo כדי שה-Set לא יווצר מחדש בכל render ────────────────
  const derived = useMemo(() => {
    if (rows.length === 0) return null;
    const globalRows = rows.filter(r => r.client_id === null);
    const clientRows = rows.filter(r => r.client_id !== null);
    const sections: Record<string, string[]> = {};
    globalRows.forEach(r => {
      if (!sections[r.section]) sections[r.section] = [];
      sections[r.section].push(r.name);
    });
    const clientCats = clientRows.map(r => r.name);
    const ignoredCats = new Set(rows.filter(r => r.is_ignored).map(r => r.name));
    const incomeCats  = new Set(rows.filter(r => r.budget_type === 'הכנסה').map(r => r.name));
    const fixedCats   = new Set(rows.filter(r => r.budget_type === 'קבוע').map(r => r.name));
    const allCats = [...globalRows.map(r => r.name), ...clientCats];
    const rules: CategoryRule[] = rows
      .filter(r => r.keywords?.length > 0 || r.max_hints?.length > 0)
      .map(r => ({ name: r.name, keywords: r.keywords || [], max_hints: r.max_hints || [] }));
    return { sections, allCats, clientCats, ignoredCats, incomeCats, fixedCats, rules };
  }, [rows]);

  // ── fallback while loading ────────────────────────────────────────────────
  if (!ready || !derived) {
    return {
      sections: FALLBACK_CATEGORIES,
      allCats: Object.values(FALLBACK_CATEGORIES).flat(),
      clientCats: [],
      ignoredCats: new Set(["להתעלם"]),
      incomeCats: new Set(FALLBACK_CATEGORIES["💰 הכנסות"] || []),
      fixedCats: new Set(),
      rules: [],
      rows: [],
      ready,
      reload: load,
    };
  }

  return { ...derived, rows, ready, reload: load };
}
