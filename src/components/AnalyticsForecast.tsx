import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { Card, Spinner } from "../ui";
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  buildTxMap, buildMonthSummary, buildCurrentMonthForecast, buildYearForecast,
  getCycleDays, currentBillingMk, getYearMonthKeys, mkLabel, mkLabelShort,
  getPeriodForMk, getScenarioTotals,
  type CurrentMonthForecast, type YearForecastSummary,
} from "../utils/analyticsUtils";
import type { CategoryRule } from "../data";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  clientId: string;
  portfolioSubs: any[];
  importedTxs: any[];
  manualTxs: any[];
  rememberedMappings: Record<string, string>;
  cycleStartDay: number;
  ignoredCats?: Set<string>;
  incomeCats?: Set<string>;
  fixedCats?: Set<string>;
  categoryRules?: CategoryRule[];
}

// ── Custom tooltip for the cumulative chart ───────────────────────────────────

function CumulativeTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const fmt = (n: number | null) => n != null ? `₪${Math.round(n).toLocaleString("he-IL")}` : "—";
  const actual   = payload.find((p: any) => p.dataKey === "cumulativeActual")?.value;
  const forecast = payload.find((p: any) => p.dataKey === "cumulativeForecast")?.value;
  const target   = payload.find((p: any) => p.dataKey === "cumulativeTarget")?.value;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontFamily: "inherit", direction: "rtl" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {actual   != null && <div style={{ color: "#6366f1", marginBottom: 2 }}>חיסכון בפועל: {fmt(actual)}</div>}
      {forecast != null && actual == null && <div style={{ color: "#a5b4fc", marginBottom: 2 }}>תחזית: {fmt(forecast)}</div>}
      {target   != null && <div style={{ color: "var(--gold)", marginBottom: 2 }}>יעד תסריט: {fmt(target)}</div>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AnalyticsForecast({ clientId, portfolioSubs, importedTxs, manualTxs, rememberedMappings, cycleStartDay, ignoredCats, incomeCats, fixedCats, categoryRules }: Props) {
  const [allPeriods, setAllPeriods]               = useState<any[]>([]);
  const [scenarioItemsCache, setScenarioItemsCache] = useState<Record<number, any[]>>({});
  const [loadingScenario, setLoadingScenario]     = useState(true);

  // ── Fetch scenario data ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoadingScenario(true);
      const { data: periods } = await supabase
        .from("active_scenario")
        .select("id, scenario_id, active_from, active_until, scenarios(name)")
        .eq("client_id", clientId)
        .order("active_from", { ascending: true });

      const pList = periods || [];
      setAllPeriods(pList);

      const uniqueIds = [...new Set(pList.map((p: any) => p.scenario_id as number))];
      const cache: Record<number, any[]> = {};
      await Promise.all(uniqueIds.map(async (scId) => {
        const { data } = await supabase
          .from("scenario_items").select("*")
          .eq("scenario_id", scId).order("sort_order");
        cache[scId] = data || [];
      }));
      setScenarioItemsCache(cache);
      setLoadingScenario(false);
    })();
  }, [clientId]); // eslint-disable-line

  // ── Derived data ──────────────────────────────────────────────────────────
  const txMap = useMemo(() =>
    buildTxMap(portfolioSubs, importedTxs, manualTxs, rememberedMappings, cycleStartDay, ignoredCats, categoryRules),
    [portfolioSubs, importedTxs, manualTxs, rememberedMappings, cycleStartDay, ignoredCats, categoryRules]
  );

  const currentMk    = useMemo(() => currentBillingMk(cycleStartDay), [cycleStartDay]);
  const cycleDays    = useMemo(() => getCycleDays(cycleStartDay), [cycleStartDay]);
  const currentYear  = Number(currentMk.split("-")[0]);

  const currentMonthForecast: CurrentMonthForecast | null = useMemo(() => {
    if (loadingScenario) return null;
    return buildCurrentMonthForecast(currentMk, cycleStartDay, txMap, allPeriods, scenarioItemsCache, incomeCats, fixedCats);
  }, [currentMk, cycleStartDay, txMap, allPeriods, scenarioItemsCache, loadingScenario, incomeCats, fixedCats]);

  const yearForecast: YearForecastSummary | null = useMemo(() => {
    if (loadingScenario || !currentMonthForecast) return null;
    const forecastCurrentSavings =
      currentMonthForecast.incomeScenario
      - currentMonthForecast.expenseFixedScenario
      - currentMonthForecast.expenseVariableProjected;
    return buildYearForecast(
      currentYear, currentMk, txMap, allPeriods, scenarioItemsCache,
      forecastCurrentSavings, incomeCats
    );
  }, [currentYear, currentMk, txMap, allPeriods, scenarioItemsCache, currentMonthForecast, loadingScenario, incomeCats]);

  const fmt    = (n: number)               => `₪${Math.round(n).toLocaleString("he-IL")}`;
  const fmtPct = (n: number)               => `${Math.round(n)}%`;
  const pctBar = (actual: number, total: number, max = 100) =>
    total > 0 ? Math.min(max, Math.round((actual / total) * 100)) : 0;

  if (loadingScenario) return <div style={{ padding: 60, textAlign: "center" }}><Spinner /></div>;

  const f = currentMonthForecast!;
  const cyclePct = pctBar(f.daysElapsed, f.daysTotal);
  const noScenario = f.incomeScenario === 0 && f.expenseFixedScenario === 0 && f.expenseVariableScenario === 0;

  return (
    <div style={{ direction: "rtl" }}>

      {/* ── Current month ── */}
      <Card style={{ marginBottom: 16, padding: "20px 22px" }}>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 14 }}>
          📅 {f.label} — {f.daysElapsed} מתוך {f.daysTotal} ימים
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>
            <span>יום {f.daysElapsed}</span>
            <span>{cyclePct}% מהחודש עבר</span>
            <span>נותרו {f.daysRemaining} ימים</span>
          </div>
          <div style={{ height: 8, background: "var(--surface2)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${cyclePct}%`, background: "var(--green-mid)", borderRadius: 4, transition: "width 0.5s" }} />
          </div>
        </div>

        {/* The one big number */}
        {!noScenario && f.daysRemaining > 0 && (
          <div style={{ background: "var(--green-pale,rgba(52,211,153,0.08))", border: "1px solid var(--green-mint,rgba(52,211,153,0.25))", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 15, color: "var(--green-deep,#065f46)", marginBottom: 4 }}>
              💡 נותרו לך להוצאות משתנות
            </div>
            <div style={{ fontWeight: 800, fontSize: 24, color: f.expenseVariableRemaining >= 0 ? "var(--green-deep,#065f46)" : "var(--red)" }}>
              {fmt(f.expenseVariableRemaining)}
            </div>
            <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 4 }}>
              ב-{f.daysRemaining} ימים הנותרים · {fmt(f.dailyBudgetRemaining)} ליום
            </div>
          </div>
        )}

        {noScenario && (
          <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 15, color: "var(--text-dim)" }}>
            אין תסריט פעיל לחודש זה — עבור ל"מאזן מתוכנן" והגדר תסריט
          </div>
        )}

        {/* Expense breakdown */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Fixed */}
          <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>הוצאות קבועות</span>
              <span>
                <span style={{ fontWeight: 700 }}>{fmt(f.expenseFixedActual)}</span>
                {f.expenseFixedScenario > 0 && (
                  <span style={{ fontSize: 13, color: "var(--text-dim)", marginRight: 6 }}>
                    מתוך {fmt(f.expenseFixedScenario)}
                    <span style={{ marginRight: 4, color: f.expenseFixedActual <= f.expenseFixedScenario ? "var(--green-soft)" : "var(--red)" }}>
                      {f.expenseFixedActual <= f.expenseFixedScenario ? " ✅" : " ⚠️"}
                    </span>
                  </span>
                )}
              </span>
            </div>
            {f.expenseFixedScenario > 0 && (
              <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pctBar(f.expenseFixedActual, f.expenseFixedScenario, 120)}%`,
                  background: f.expenseFixedActual <= f.expenseFixedScenario ? "var(--green-soft)" : "var(--red)", borderRadius: 3 }} />
              </div>
            )}
          </div>

          {/* Variable */}
          <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>הוצאות משתנות</span>
              <span>
                <span style={{ fontWeight: 700 }}>{fmt(f.expenseVariableActual)}</span>
                <span style={{ fontSize: 13, color: "var(--text-dim)", marginRight: 6 }}>בפועל</span>
              </span>
            </div>
            {f.expenseVariableScenario > 0 && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>
                  <span>תחזית לסוף חודש: <strong style={{ color: f.expenseVariableProjected > f.expenseVariableScenario ? "var(--red)" : "var(--text)" }}>{fmt(f.expenseVariableProjected)}</strong></span>
                  <span>תקציב: {fmt(f.expenseVariableScenario)}</span>
                </div>
                <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pctBar(f.expenseVariableActual, f.expenseVariableScenario, 120)}%`,
                    background: f.expenseVariableProjected > f.expenseVariableScenario ? "var(--red)" : "var(--green-soft)", borderRadius: 3 }} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Category alerts */}
        {f.alerts.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--red)", marginBottom: 8 }}>⚠️ קטגוריות בסיכון לחריגה</div>
            {f.alerts.map(a => (
              <div key={a.cat} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 5, background: "rgba(248,113,113,0.06)", borderRadius: 8, padding: "6px 10px" }}>
                <span style={{ fontWeight: 600 }}>{a.cat}</span>
                <span>
                  <span style={{ color: "var(--text-dim)", marginLeft: 6 }}>עד היום: {fmt(a.actual)}</span>
                  <span style={{ color: "var(--red)", fontWeight: 700, marginLeft: 6 }}> → תחזית: {fmt(a.projected)}</span>
                  <span style={{ color: "var(--text-dim)", marginLeft: 6 }}> תק׳: {fmt(a.budget)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Year forecast chart ── */}
      {yearForecast && (
        <Card style={{ padding: "20px 16px 12px" }}>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 16 }}>📈 מסלול חיסכון {currentYear}</div>

          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={yearForecast.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="labelShort" tick={{ fill: "var(--text-dim)", fontSize: 13 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-dim)", fontSize: 12 }} tickFormatter={v => `${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} width={36} />
              <Tooltip content={<CumulativeTooltip />} />

              {/* Current month reference line */}
              <ReferenceLine x={mkLabelShort(currentMk)} stroke="var(--border)" strokeWidth={1.5} strokeDasharray="2 2" />

              {/* Target cumulative line */}
              <Line type="monotone" dataKey="cumulativeTarget" stroke="var(--gold)"
                strokeDasharray="5 3" strokeWidth={1.5} dot={false} name="יעד" connectNulls />

              {/* Actual cumulative line */}
              <Line type="monotone" dataKey="cumulativeActual" stroke="#6366f1"
                strokeWidth={2.5} dot={{ r: 3, fill: "#6366f1" }} name="בפועל" connectNulls />

              {/* Forecast continuation */}
              <Line type="monotone" dataKey="cumulativeForecast" stroke="#a5b4fc"
                strokeDasharray="4 2" strokeWidth={2} dot={false} name="תחזית" connectNulls />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
            {[
              { color: "#6366f1",       label: "חיסכון בפועל" },
              { color: "#a5b4fc",       label: "תחזית", dashed: true },
              { color: "var(--gold)",   label: "יעד תסריט", dashed: true },
            ].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--text-dim)" }}>
                <div style={{ width: 18, height: 3, background: l.dashed ? "transparent" : l.color,
                  borderTop: l.dashed ? `2px dashed ${l.color}` : "none" }} />
                {l.label}
              </div>
            ))}
          </div>

          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 18 }}>
            {[
              { label: "חיסכון עד היום", value: fmt(yearForecast.actualToDate), color: "#6366f1" },
              { label: `תחזית ${currentYear}`, value: fmt(yearForecast.forecastTotal), color: "#6366f1" },
              {
                label: "פער מיעד",
                value: `${yearForecast.gap >= 0 ? "+" : ""}${fmt(yearForecast.gap)}`,
                color: yearForecast.gap >= 0 ? "var(--green-soft)" : "var(--red)",
                sub: yearForecast.gap >= 0 ? "✅ על המסלול" : "⚠️ מתחת ליעד",
              },
              {
                label: "שיעור חיסכון צפוי",
                value: fmtPct(yearForecast.savingsRateForecast),
                color: yearForecast.savingsRateForecast >= 15 ? "var(--green-soft)" : yearForecast.savingsRateForecast >= 5 ? "var(--gold)" : "var(--red)",
              },
            ].map(k => (
              <div key={k.label} style={{ background: "var(--surface2)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 3 }}>{k.label}</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: (k as any).color }}>{k.value}</div>
                {(k as any).sub && <div style={{ fontSize: 12, color: (k as any).color, marginTop: 2 }}>{(k as any).sub}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
