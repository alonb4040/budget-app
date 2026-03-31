/**
 * analyticsUtils.ts — Pure calculation functions for Analytics tabs.
 * No React, no Supabase. All functions are deterministic given the inputs.
 */

import { CATEGORIES, IGNORED_CATEGORIES, classifyTx, HEBREW_MONTHS, assignBillingMonth } from "../data";

// ── Income category set ───────────────────────────────────────────────────────
export const INCOME_CATS = new Set<string>(CATEGORIES["💰 הכנסות"] ?? []);

// ── Types ─────────────────────────────────────────────────────────────────────

/** Raw map: { "YYYY-MM": { categoryName: totalAmount } } */
export type TxMap = Record<string, Record<string, number>>;

/** Summary for one billing month */
export interface MonthSummary {
  mk: string;               // "YYYY-MM"
  label: string;            // "ינואר 2025"
  labelShort: string;       // "ינו׳"
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number;      // 0-100, NaN if income=0
  // Scenario values (0 if no scenario)
  scenarioIncome: number;
  scenarioExpenseFixed: number;
  scenarioExpenseVariable: number;
  scenarioExpense: number;
  scenarioSavings: number;
  scenarioName: string;
  scenarioId: number | null;
  hasData: boolean;
}

/** A point where the active scenario changed between two consecutive months */
export interface ScenarioChange {
  mk: string;               // first month of new scenario
  label: string;
  fromName: string;
  toName: string;
}

/** Per-category alert for the current month */
export interface CatAlert {
  cat: string;
  actual: number;
  projected: number;
  budget: number;           // 0 if no scenario
}

/** Result of current-month forecast */
export interface CurrentMonthForecast {
  mk: string;
  label: string;
  daysElapsed: number;
  daysTotal: number;
  daysRemaining: number;
  incomeActual: number;
  incomeScenario: number;
  expenseFixedActual: number;    // fixed cats actually spent
  expenseFixedScenario: number;
  expenseVariableActual: number;
  expenseVariableProjected: number;
  expenseVariableScenario: number;
  expenseVariableRemaining: number; // scenario - actual (≥ 0 means still ok)
  dailyBudgetRemaining: number;     // remaining / daysRemaining
  alerts: CatAlert[];               // variable cats on track to exceed budget
}

/** One data point in the cumulative savings chart */
export interface YearForecastPoint {
  mk: string;
  label: string;
  labelShort: string;
  cumulativeActual: number | null;    // null for future months
  cumulativeForecast: number | null;  // null for past months (except current)
  cumulativeTarget: number;           // scenario target cumulative
  isCurrentMonth: boolean;
  isFuture: boolean;
}

export interface YearForecastSummary {
  points: YearForecastPoint[];
  actualToDate: number;
  forecastTotal: number;
  targetTotal: number;
  gap: number;              // forecastTotal - targetTotal (negative = below target)
  savingsRateForecast: number;
}

// ── Label helpers ─────────────────────────────────────────────────────────────

const SHORT = ["ינו׳","פב׳","מר׳","אפ׳","מאי","יוני","יול׳","אוג׳","ספ׳","אוק׳","נוב׳","דצ׳"];

export function mkLabel(mk: string): string {
  if (!mk) return "";
  const [y, m] = mk.split("-");
  return `${HEBREW_MONTHS[+m - 1]} ${y}`;
}

export function mkLabelShort(mk: string): string {
  if (!mk) return "";
  const [, m] = mk.split("-");
  return SHORT[+m - 1] ?? mk;
}

// ── Month key helpers ─────────────────────────────────────────────────────────

/** Current billing-month key, respecting cycleStartDay */
export function currentBillingMk(cycleStartDay: number): string {
  const now = new Date();
  const d = now.getDate();
  const m = now.getMonth() + 1; // 1-12
  const y = now.getFullYear();
  let bm = m;
  let by = y;
  if (d >= (cycleStartDay || 1)) {
    bm = m + 1;
    if (bm > 12) { bm = 1; by = y + 1; }
  }
  return `${by}-${String(bm).padStart(2, "0")}`;
}

/** Last 12 billing-month keys (rolling), newest last */
export function getLast12MonthKeys(cycleStartDay: number): string[] {
  const cur = currentBillingMk(cycleStartDay);
  const [cy, cm] = cur.split("-").map(Number);
  const keys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    let m = cm - i;
    let y = cy;
    while (m <= 0) { m += 12; y--; }
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return keys;
}

/** All 12 keys for a calendar year */
export function getYearMonthKeys(year: number): string[] {
  const keys: string[] = [];
  for (let m = 1; m <= 12; m++) keys.push(`${year}-${String(m).padStart(2, "0")}`);
  return keys;
}

// ── Days in current billing cycle ────────────────────────────────────────────

export function getCycleDays(cycleStartDay: number): { daysElapsed: number; daysTotal: number; daysRemaining: number } {
  const today = new Date();
  const d = today.getDate();
  const m = today.getMonth(); // 0-based
  const y = today.getFullYear();
  const csd = Math.max(1, cycleStartDay || 1);

  let cycleStart: Date;
  if (d >= csd) {
    cycleStart = new Date(y, m, csd);
  } else {
    // Cycle started last calendar month
    if (m === 0) {
      cycleStart = new Date(y - 1, 11, csd);
    } else {
      cycleStart = new Date(y, m - 1, csd);
    }
  }

  // Cycle end = one day before next cycle start
  const nextCycleStart = new Date(cycleStart);
  nextCycleStart.setMonth(nextCycleStart.getMonth() + 1);
  const cycleEnd = new Date(nextCycleStart.getTime() - 24 * 60 * 60 * 1000);

  const MS = 1000 * 60 * 60 * 24;
  const daysTotal    = Math.round((cycleEnd.getTime() - cycleStart.getTime()) / MS) + 1;
  const daysElapsed  = Math.max(1, Math.round((today.getTime() - cycleStart.getTime()) / MS) + 1);
  const daysRemaining = Math.max(0, daysTotal - daysElapsed);

  return { daysElapsed, daysTotal, daysRemaining };
}

// ── Build TxMap from all three sources ───────────────────────────────────────

export function buildTxMap(
  portfolioSubs: any[],
  importedTxs: any[],
  manualTxs: any[],
  rememberedMappings: Record<string, string>,
  cycleStartDay: number
): TxMap {
  const map: TxMap = {};

  const add = (mk: string | null, cat: string, amt: number) => {
    if (!mk || !cat || !amt || amt <= 0) return;
    if (!map[mk]) map[mk] = {};
    map[mk][cat] = (map[mk][cat] || 0) + amt;
  };

  portfolioSubs.forEach(sub => {
    const mk = sub.month_key;
    if (!mk) return;
    (sub.transactions || []).forEach((tx: any) => {
      if (IGNORED_CATEGORIES.has(tx.cat)) return;
      add(mk, tx.cat || "אחר-משתנה", Number(tx.amount || 0));
    });
  });

  (importedTxs || []).forEach((tx: any) => {
    if ((tx.amount || 0) <= 0) return;
    const mk = tx.billing_month || assignBillingMonth(tx.date, cycleStartDay || 1);
    if (!mk) return;
    const { cat } = classifyTx(tx.name, tx.max_category, rememberedMappings || {});
    if (IGNORED_CATEGORIES.has(cat)) return;
    add(mk, cat, Number(tx.amount || 0));
  });

  (manualTxs || []).forEach((tx: any) => {
    if ((tx.amount || 0) <= 0) return;
    const mk = tx.billing_month;
    if (!mk) return;
    if (IGNORED_CATEGORIES.has(tx.cat)) return;
    add(mk, tx.cat, Number(tx.amount || 0));
  });

  return map;
}

// ── Scenario helpers ──────────────────────────────────────────────────────────

/** Find the active scenario period for a given month key */
export function getPeriodForMk(mk: string, allPeriods: any[]): any | null {
  if (!mk || !allPeriods?.length) return null;
  return allPeriods.find((p: any) => {
    return p.active_from <= mk + "-99" && (!p.active_until || p.active_until >= mk + "-01");
  }) ?? null;
}

/** Get scenario totals from items cache for a given period */
export function getScenarioTotals(
  period: any | null,
  scenarioItemsCache: Record<number, any[]>
): { income: number; expenseFixed: number; expenseVariable: number; expense: number; savings: number; name: string; id: number | null } {
  const empty = { income: 0, expenseFixed: 0, expenseVariable: 0, expense: 0, savings: 0, name: "", id: null };
  if (!period) return empty;
  const items: any[] = scenarioItemsCache[period.scenario_id] ?? [];
  if (!items.length) return { ...empty, name: period.scenarios?.name ?? "", id: period.scenario_id };

  let income = 0, expenseFixed = 0, expenseVariable = 0;
  items.forEach(item => {
    const amt = Number(item.amount || 0);
    if (item.item_type === "income")             income += amt;
    else if (item.item_type === "expense_fixed") expenseFixed += amt;
    else if (item.item_type === "expense_variable") expenseVariable += amt;
  });

  return {
    income,
    expenseFixed,
    expenseVariable,
    expense: expenseFixed + expenseVariable,
    savings: income - expenseFixed - expenseVariable,
    name: period.scenarios?.name ?? "",
    id: period.scenario_id,
  };
}

// ── Month summary ─────────────────────────────────────────────────────────────

export function buildMonthSummary(
  mk: string,
  txMap: TxMap,
  allPeriods: any[],
  scenarioItemsCache: Record<number, any[]>
): MonthSummary {
  const cats = txMap[mk] ?? {};
  let income = 0, expenses = 0;
  Object.entries(cats).forEach(([cat, amt]) => {
    if (INCOME_CATS.has(cat)) income += amt;
    else expenses += amt;
  });

  const savings     = income - expenses;
  const savingsRate = income > 0 ? (savings / income) * 100 : NaN;

  const period   = getPeriodForMk(mk, allPeriods);
  const sc       = getScenarioTotals(period, scenarioItemsCache);
  const hasData  = Object.keys(cats).length > 0;

  return {
    mk,
    label: mkLabel(mk),
    labelShort: mkLabelShort(mk),
    income,
    expenses,
    savings,
    savingsRate,
    scenarioIncome: sc.income,
    scenarioExpenseFixed: sc.expenseFixed,
    scenarioExpenseVariable: sc.expenseVariable,
    scenarioExpense: sc.expense,
    scenarioSavings: sc.savings,
    scenarioName: sc.name,
    scenarioId: sc.id,
    hasData,
  };
}

export function buildMonthSummaries(
  monthKeys: string[],
  txMap: TxMap,
  allPeriods: any[],
  scenarioItemsCache: Record<number, any[]>
): MonthSummary[] {
  return monthKeys.map(mk => buildMonthSummary(mk, txMap, allPeriods, scenarioItemsCache));
}

// ── Scenario change detection ─────────────────────────────────────────────────

export function detectScenarioChanges(summaries: MonthSummary[]): ScenarioChange[] {
  const changes: ScenarioChange[] = [];
  for (let i = 1; i < summaries.length; i++) {
    const prev = summaries[i - 1];
    const cur  = summaries[i];
    if (cur.scenarioId !== null && prev.scenarioId !== null && cur.scenarioId !== prev.scenarioId) {
      changes.push({ mk: cur.mk, label: cur.label, fromName: prev.scenarioName, toName: cur.scenarioName });
    }
  }
  return changes;
}

// ── KPI aggregates ────────────────────────────────────────────────────────────

export interface KpiAggregates {
  avgIncome: number;
  avgExpenses: number;
  avgSavings: number;
  avgSavingsRate: number;
  trajectory: "up" | "down" | "stable"; // savings rate trend
  dataMonthsCount: number;
}

export function computeKpis(summaries: MonthSummary[]): KpiAggregates {
  const withData = summaries.filter(s => s.hasData);
  if (!withData.length) return { avgIncome: 0, avgExpenses: 0, avgSavings: 0, avgSavingsRate: 0, trajectory: "stable", dataMonthsCount: 0 };

  const n = withData.length;
  const avgIncome   = withData.reduce((s, m) => s + m.income, 0) / n;
  const avgExpenses = withData.reduce((s, m) => s + m.expenses, 0) / n;
  const avgSavings  = avgIncome - avgExpenses;
  const avgSavingsRate = avgIncome > 0 ? (avgSavings / avgIncome) * 100 : 0;

  // Trajectory: compare last 3 vs previous 3 savings rates
  let trajectory: "up" | "down" | "stable" = "stable";
  if (withData.length >= 4) {
    const last3 = withData.slice(-3).filter(m => m.income > 0);
    const prev3 = withData.slice(-6, -3).filter(m => m.income > 0);
    if (last3.length && prev3.length) {
      const r1 = last3.reduce((s, m) => s + m.savingsRate, 0) / last3.length;
      const r2 = prev3.reduce((s, m) => s + m.savingsRate, 0) / prev3.length;
      if (r1 - r2 > 2) trajectory = "up";
      else if (r2 - r1 > 2) trajectory = "down";
    }
  }

  return { avgIncome, avgExpenses, avgSavings, avgSavingsRate, trajectory, dataMonthsCount: n };
}

// ── Current-month categories for selected month detail ────────────────────────

export interface CatDetail {
  cat: string;
  amount: number;
  budget: number;
  avg3: number;
  pctVsAvg: number;
  pctVsBudget: number;
}

export function buildCatDetails(
  mk: string,
  summaries: MonthSummary[],
  txMap: TxMap,
  scenarioItemsCache: Record<number, any[]>
): { over: CatDetail[]; under: CatDetail[] } {
  const cats = txMap[mk] ?? {};
  const idx = summaries.findIndex(s => s.mk === mk);
  const prev3 = summaries.slice(Math.max(0, idx - 3), idx).filter(s => s.hasData);

  // Get scenario items for this month
  const summary = summaries[idx];
  const items: any[] = summary?.scenarioId != null ? (scenarioItemsCache[summary.scenarioId] ?? []) : [];
  const budgetMap: Record<string, number> = {};
  items.forEach(item => { budgetMap[item.category_name] = Number(item.amount || 0); });

  const over: CatDetail[] = [];
  const under: CatDetail[] = [];

  Object.entries(cats).forEach(([cat, amount]) => {
    if (INCOME_CATS.has(cat)) return;
    const avg3 = prev3.length > 0
      ? prev3.reduce((s, s2) => s + (txMap[s2.mk]?.[cat] || 0), 0) / prev3.length
      : 0;
    const budget = budgetMap[cat] ?? 0;
    const pctVsAvg = avg3 > 50 ? ((amount - avg3) / avg3) * 100 : 0;
    const pctVsBudget = budget > 0 ? ((amount - budget) / budget) * 100 : 0;

    if (avg3 > 100 && pctVsAvg >= 25)  over.push({ cat, amount, budget, avg3, pctVsAvg, pctVsBudget });
    if (avg3 > 100 && pctVsAvg <= -20) under.push({ cat, amount, budget, avg3, pctVsAvg, pctVsBudget });
  });

  over.sort((a, b) => b.pctVsAvg - a.pctVsAvg);
  under.sort((a, b) => a.pctVsAvg - b.pctVsAvg);

  return { over: over.slice(0, 5), under: under.slice(0, 3) };
}

// ── Current-month forecast ────────────────────────────────────────────────────

export function buildCurrentMonthForecast(
  mk: string,
  cycleStartDay: number,
  txMap: TxMap,
  allPeriods: any[],
  scenarioItemsCache: Record<number, any[]>
): CurrentMonthForecast {
  const { daysElapsed, daysTotal, daysRemaining } = getCycleDays(cycleStartDay);
  const cats = txMap[mk] ?? {};

  const period = getPeriodForMk(mk, allPeriods);
  const sc     = getScenarioTotals(period, scenarioItemsCache);
  const items: any[] = period ? (scenarioItemsCache[period.scenario_id] ?? []) : [];

  // Fixed cats = those appearing in expense_fixed scenario items
  const fixedCatSet = new Set<string>(
    items.filter(i => i.item_type === "expense_fixed").map(i => i.category_name as string)
  );
  const budgetMap: Record<string, number> = {};
  items.forEach(i => { if (i.item_type !== "income") budgetMap[i.category_name] = Number(i.amount || 0); });

  let incomeActual = 0, expenseFixedActual = 0, expenseVariableActual = 0;
  Object.entries(cats).forEach(([cat, amt]) => {
    if (INCOME_CATS.has(cat)) { incomeActual += amt; return; }
    if (fixedCatSet.has(cat)) expenseFixedActual += amt;
    else expenseVariableActual += amt;
  });

  // Project variable expenses to end of month
  const ratio = daysElapsed > 0 ? daysTotal / daysElapsed : 1;
  const expenseVariableProjected = expenseVariableActual * ratio;
  const expenseVariableRemaining = Math.max(0, sc.expenseVariable - expenseVariableActual);
  const dailyBudgetRemaining = daysRemaining > 0 ? expenseVariableRemaining / daysRemaining : 0;

  // Alerts: variable categories projected to exceed budget
  const alerts: CatAlert[] = [];
  Object.entries(cats).forEach(([cat, actual]) => {
    if (INCOME_CATS.has(cat) || fixedCatSet.has(cat)) return;
    const projected = actual * ratio;
    const budget    = budgetMap[cat] ?? 0;
    if (budget > 0 && projected > budget * 1.1) {
      alerts.push({ cat, actual, projected, budget });
    }
  });
  alerts.sort((a, b) => (b.projected / b.budget) - (a.projected / a.budget));

  return {
    mk,
    label: mkLabel(mk),
    daysElapsed,
    daysTotal,
    daysRemaining,
    incomeActual,
    incomeScenario: sc.income,
    expenseFixedActual,
    expenseFixedScenario: sc.expenseFixed,
    expenseVariableActual,
    expenseVariableProjected,
    expenseVariableScenario: sc.expenseVariable,
    expenseVariableRemaining,
    dailyBudgetRemaining,
    alerts: alerts.slice(0, 4),
  };
}

// ── Year forecast ─────────────────────────────────────────────────────────────

export function buildYearForecast(
  year: number,
  currentMk: string,
  txMap: TxMap,
  allPeriods: any[],
  scenarioItemsCache: Record<number, any[]>,
  forecastCurrentMonthSavings: number // pre-computed from buildCurrentMonthForecast
): YearForecastSummary {
  const monthKeys = getYearMonthKeys(year);
  let cumulativeActual   = 0;
  let cumulativeForecast = 0;
  let cumulativeTarget   = 0;

  const points: YearForecastPoint[] = monthKeys.map(mk => {
    const isCurrent = mk === currentMk;
    const isFuture  = mk > currentMk;
    const isPast    = mk < currentMk;

    const sc = getScenarioTotals(getPeriodForMk(mk, allPeriods), scenarioItemsCache);
    const targetSavings = sc.savings;
    cumulativeTarget += targetSavings;

    let cumulativeActualPoint: number | null = null;
    let cumulativeForecastPoint: number | null = null;

    if (isPast) {
      const s = buildMonthSummary(mk, txMap, allPeriods, scenarioItemsCache);
      cumulativeActual += s.savings;
      cumulativeActualPoint = cumulativeActual;
    } else if (isCurrent) {
      cumulativeActual += forecastCurrentMonthSavings;
      cumulativeActualPoint = cumulativeActual;
      cumulativeForecast = cumulativeActual;
      cumulativeForecastPoint = cumulativeForecast;
    } else {
      // Future: use scenario savings (income - all expenses)
      // For variable expenses, we use what the scenario says (no trailing average adjustment here)
      cumulativeForecast += sc.savings;
      cumulativeForecastPoint = cumulativeActual + cumulativeForecast - (cumulativeActual); // relative
      // Recompute: forecast is cumulative from current month forward
      cumulativeForecastPoint = cumulativeForecast + cumulativeActual;
    }

    return {
      mk,
      label: mkLabel(mk),
      labelShort: mkLabelShort(mk),
      cumulativeActual: cumulativeActualPoint,
      cumulativeForecast: cumulativeForecastPoint,
      cumulativeTarget,
      isCurrentMonth: isCurrent,
      isFuture,
    };
  });

  // Fix forecast accumulation (it was relative, recalculate properly)
  let fwdCumulative = cumulativeActual;
  for (const p of points) {
    if (p.isFuture) {
      const sc = getScenarioTotals(getPeriodForMk(p.mk, allPeriods), scenarioItemsCache);
      fwdCumulative += sc.savings;
      p.cumulativeForecast = fwdCumulative;
    }
  }

  const forecastTotal = fwdCumulative;

  // Savings rate forecast: use actual income for past + scenario income for future
  const pastSummaries = monthKeys
    .filter(mk => mk < currentMk)
    .map(mk => buildMonthSummary(mk, txMap, allPeriods, scenarioItemsCache))
    .filter(s => s.hasData);
  const futureIncomeSum = monthKeys
    .filter(mk => mk >= currentMk)
    .reduce((sum, mk) => sum + getScenarioTotals(getPeriodForMk(mk, allPeriods), scenarioItemsCache).income, 0);
  const totalIncomeYear = pastSummaries.reduce((s, m) => s + m.income, 0) + futureIncomeSum;
  const savingsRateForecast = totalIncomeYear > 0 ? (forecastTotal / totalIncomeYear) * 100 : 0;

  return {
    points,
    actualToDate: cumulativeActual,
    forecastTotal,
    targetTotal: cumulativeTarget,
    gap: forecastTotal - cumulativeTarget,
    savingsRateForecast,
  };
}
