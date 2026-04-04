import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { CATEGORIES as FALLBACK_CATEGORIES } from "../data";

export interface CategoryRow {
  id: number;
  name: string;
  section: string;
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

  // ── fallback while loading ────────────────────────────────────────────────
  if (!ready || rows.length === 0) {
    const allCats = Object.values(FALLBACK_CATEGORIES).flat();
    return {
      sections: FALLBACK_CATEGORIES,
      allCats,
      clientCats: [],
      ignoredCats: new Set(["להתעלם"]),
      rows: [],
      ready,
      reload: load,
    };
  }

  // ── split global vs client ────────────────────────────────────────────────
  const globalRows = rows.filter(r => r.client_id === null);
  const clientRows = rows.filter(r => r.client_id !== null);

  // build sections map from global rows (preserving order)
  const sections: Record<string, string[]> = {};
  globalRows.forEach(r => {
    if (!sections[r.section]) sections[r.section] = [];
    sections[r.section].push(r.name);
  });

  const clientCats = clientRows.map(r => r.name);
  const ignoredCats = new Set(rows.filter(r => r.is_ignored).map(r => r.name));
  const allCats = [...globalRows.map(r => r.name), ...clientCats];

  return { sections, allCats, clientCats, ignoredCats, rows, ready, reload: load };
}
