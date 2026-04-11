import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { Card, Spinner } from "../ui";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Legend,
} from "recharts";
import {
  buildTxMap, buildMonthSummaries, detectScenarioChanges, computeKpis,
  buildCatDetails, getLast12MonthKeys, getYearMonthKeys, mkLabel,
  currentBillingMk,
  type MonthSummary, type ScenarioChange,
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
  categoryRules?: CategoryRule[];
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const income   = payload.find((p: any) => p.dataKey === "income")?.value ?? 0;
  const expenses = payload.find((p: any) => p.dataKey === "expenses")?.value ?? 0;
  const savings  = income - expenses;
  const fmt = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", fontSize: 15, fontFamily: "inherit", direction: "rtl", minWidth: 160 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ color: "var(--green-mid)", marginBottom: 2 }}>הכנסות: {fmt(income)}</div>
      <div style={{ color: "var(--red)", marginBottom: 2 }}>הוצאות: {fmt(expenses)}</div>
      <div style={{ color: savings >= 0 ? "var(--green-soft)" : "var(--red)", fontWeight: 700 }}>
        חיסכון: {fmt(savings)} {income > 0 ? `(${Math.round(savings / income * 100)}%)` : ""}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AnalyticsTrends({ clientId, portfolioSubs, importedTxs, manualTxs, rememberedMappings, cycleStartDay, ignoredCats, incomeCats, categoryRules }: Props) {
  // Scenario data fetched internally
  const [allPeriods, setAllPeriods]               = useState<any[]>([]);
  const [scenarioItemsCache, setScenarioItemsCache] = useState<Record<number, any[]>>({});
  const [loadingScenario, setLoadingScenario]     = useState(true);

  // View controls
  const NOW_YEAR = new Date().getFullYear();
  const [viewMode, setViewMode]   = useState<"rolling12" | "year">("rolling12");
  const [selectedYear, setSelectedYear] = useState(NOW_YEAR);
  const [selectedMk, setSelectedMk]     = useState<string | null>(null);

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

      // Load items for each unique scenario_id
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

  // ── Build txMap ──────────────────────────────────────────────────────────
  const txMap = useMemo(() =>
    buildTxMap(portfolioSubs, importedTxs, manualTxs, rememberedMappings, cycleStartDay, ignoredCats, categoryRules),
    [portfolioSubs, importedTxs, manualTxs, rememberedMappings, cycleStartDay, ignoredCats, categoryRules]
  );

  // ── Month keys for current view ──────────────────────────────────────────
  const monthKeys = useMemo(() =>
    viewMode === "rolling12"
      ? getLast12MonthKeys(cycleStartDay)
      : getYearMonthKeys(selectedYear),
    [viewMode, selectedYear, cycleStartDay]
  );

  // ── Summaries ─────────────────────────────────────────────────────────────
  const summaries: MonthSummary[] = useMemo(() =>
    buildMonthSummaries(monthKeys, txMap, allPeriods, scenarioItemsCache, incomeCats),
    [monthKeys, txMap, allPeriods, scenarioItemsCache, incomeCats]
  );

  const scenarioChanges: ScenarioChange[] = useMemo(() =>
    detectScenarioChanges(summaries), [summaries]
  );

  const kpis = useMemo(() => computeKpis(summaries), [summaries]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => summaries.map(s => ({
    mk: s.mk,
    label: s.labelShort,
    income: s.income,
    expenses: s.expenses,
    savings: s.savings,
    scenarioBudget: s.scenarioExpense > 0 ? s.scenarioExpense : null,
  })), [summaries]);

  // ── Set default selected month = latest with data ────────────────────────
  useEffect(() => {
    const withData = [...summaries].reverse().find(s => s.hasData);
    if (withData && !selectedMk) setSelectedMk(withData.mk);
    else if (withData) setSelectedMk(prev => {
      const still = summaries.find(s => s.mk === prev);
      return still ? prev : withData.mk;
    });
  }, [summaries]); // eslint-disable-line

  const selectedSummary = summaries.find(s => s.mk === selectedMk) ?? null;
  const catDetails = useMemo(() =>
    selectedMk ? buildCatDetails(selectedMk, summaries, txMap, scenarioItemsCache, incomeCats) : { over: [], under: [] },
    [selectedMk, summaries, txMap, scenarioItemsCache, incomeCats]
  );

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fmt     = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
  const fmtPct  = (n: number) => `${Math.round(n)}%`;
  const arrow   = kpis.trajectory === "up" ? "↑" : kpis.trajectory === "down" ? "↓" : "→";
  const arrowColor = kpis.trajectory === "up" ? "var(--green-soft)" : kpis.trajectory === "down" ? "var(--red)" : "var(--text-dim)";

  const vsScenario = selectedSummary && selectedSummary.scenarioExpense > 0
    ? selectedSummary.expenses - selectedSummary.scenarioExpense
    : null;

  if (loadingScenario) return (
    <div style={{ padding: 60, textAlign: "center" }}><Spinner /></div>
  );

  const noData = summaries.every(s => !s.hasData);

  return (
    <div style={{ direction: "rtl" }}>

      {/* ── KPI row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "ממוצע הכנסות", value: fmt(kpis.avgIncome), color: "var(--green-mid)", sub: `${kpis.dataMonthsCount} חודשים` },
          { label: "ממוצע הוצאות", value: fmt(kpis.avgExpenses), color: "var(--red)", sub: `${kpis.dataMonthsCount} חודשים` },
          { label: "ממוצע חיסכון", value: fmt(kpis.avgSavings), color: kpis.avgSavings >= 0 ? "var(--green-soft)" : "var(--red)", sub: "" },
          {
            label: "שיעור חיסכון",
            value: kpis.dataMonthsCount > 0 ? `${fmtPct(kpis.avgSavingsRate)} ${arrow}` : "—",
            color: kpis.avgSavingsRate >= 15 ? "var(--green-soft)" : kpis.avgSavingsRate >= 5 ? "var(--gold)" : "var(--red)",
            valueColor: arrowColor,
            sub: summaries.find(s => s.scenarioSavings > 0)
              ? `יעד: ${fmtPct(summaries.find(s => s.scenarioSavings > 0)!.scenarioSavings / summaries.find(s => s.scenarioSavings > 0)!.scenarioIncome * 100)}`
              : "",
          },
        ].map(k => (
          <Card key={k.label} style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontWeight: 800, fontSize: 20, color: k.color }}>{k.value}</div>
            {k.sub && <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>{k.sub}</div>}
          </Card>
        ))}
      </div>

      {/* ── View controls ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
          {[
            { id: "rolling12" as const, label: "12 חודשים אחרונים" },
            { id: "year" as const,      label: "שנה קלנדרית" },
          ].map(v => (
            <button key={v.id} onClick={() => setViewMode(v.id)} style={{
              padding: "7px 14px", fontSize: 14, fontFamily: "inherit", cursor: "pointer", border: "none",
              background: viewMode === v.id ? "var(--green-mid)" : "var(--surface2)",
              color: viewMode === v.id ? "#fff" : "var(--text-dim)", fontWeight: viewMode === v.id ? 700 : 400,
            }}>{v.label}</button>
          ))}
        </div>
        {viewMode === "year" && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={() => setSelectedYear(y => y - 1)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 16 }}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 16, minWidth: 50, textAlign: "center" }}>{selectedYear}</span>
            <button onClick={() => setSelectedYear(y => Math.min(y + 1, NOW_YEAR))} disabled={selectedYear >= NOW_YEAR}
              style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface2)", cursor: selectedYear >= NOW_YEAR ? "default" : "pointer", fontSize: 16, opacity: selectedYear >= NOW_YEAR ? 0.4 : 1 }}>›</button>
          </div>
        )}
      </div>

      {/* ── Chart ── */}
      <Card style={{ marginBottom: 16, padding: "20px 16px 12px" }}>
        {noData ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-dim)", fontSize: 16 }}>
            אין נתונים לתקופה זו — העלה חודשים בטאב "תיק כלכלי"
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                onClick={(d: any) => { if (d?.activePayload?.[0]) setSelectedMk(d.activePayload[0].payload.mk); }}
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--text-dim)", fontSize: 13 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-dim)", fontSize: 12 }} tickFormatter={v => `${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} width={36} />
                <Tooltip content={<ChartTooltip />} />

                {/* Scenario change reference lines */}
                {scenarioChanges.map(sc => (
                  <ReferenceLine key={sc.mk} x={mkLabelShort(sc.mk)}
                    stroke="var(--gold)" strokeDasharray="4 2" strokeWidth={1.5}
                    label={{ value: `תסריט: ${sc.toName}`, position: "top", fontSize: 11, fill: "var(--gold)", offset: 4 }}
                  />
                ))}

                {/* Scenario budget line */}
                <Line type="stepAfter" dataKey="scenarioBudget" stroke="var(--gold)"
                  strokeDasharray="5 3" strokeWidth={1.5} dot={false} name="יעד תסריט"
                  connectNulls={false} />

                {/* Income bar */}
                <Bar dataKey="income" name="הכנסות" fill="var(--green-mid)" radius={[3, 3, 0, 0]} barSize={18} opacity={0.9}
                  onClick={(d: any) => setSelectedMk(d.mk)} />

                {/* Expenses bar */}
                <Bar dataKey="expenses" name="הוצאות" fill="var(--red)" radius={[3, 3, 0, 0]} barSize={18} opacity={0.75}
                  onClick={(d: any) => setSelectedMk(d.mk)} />

                {/* Savings line */}
                <Line type="monotone" dataKey="savings" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: "#6366f1" }} name="חיסכון" connectNulls />

                {/* Selected month indicator */}
                {selectedMk && (() => {
                  const s = summaries.find(s => s.mk === selectedMk);
                  return s ? <ReferenceLine x={s.labelShort} stroke="var(--border)" strokeWidth={2} /> : null;
                })()}
              </ComposedChart>
            </ResponsiveContainer>

            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
              {[
                { color: "var(--green-mid)", label: "הכנסות" },
                { color: "var(--red)",       label: "הוצאות" },
                { color: "#6366f1",          label: "חיסכון" },
                { color: "var(--gold)",      label: "יעד תסריט", dashed: true },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--text-dim)" }}>
                  <div style={{ width: l.dashed ? 18 : 10, height: 3, background: l.dashed ? "transparent" : l.color,
                    borderTop: l.dashed ? `2px dashed ${l.color}` : "none", borderRadius: 2 }} />
                  {l.label}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", marginTop: 4 }}>
              לחץ על חודש לפירוט
            </div>
          </>
        )}
      </Card>

      {/* ── Selected month detail ── */}
      {selectedSummary && selectedSummary.hasData && (
        <Card style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 14 }}>{selectedSummary.label}</div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
            {[
              { label: "הכנסות", value: fmt(selectedSummary.income), color: "var(--green-mid)" },
              { label: "הוצאות", value: fmt(selectedSummary.expenses), color: "var(--red)" },
              {
                label: "חיסכון",
                value: `${fmt(selectedSummary.savings)} (${isNaN(selectedSummary.savingsRate) ? "—" : fmtPct(selectedSummary.savingsRate)})`,
                color: selectedSummary.savings >= 0 ? "var(--green-soft)" : "var(--red)",
              },
              vsScenario !== null ? {
                label: "vs תסריט",
                value: `${vsScenario >= 0 ? "+" : ""}${fmt(vsScenario)}`,
                color: vsScenario <= 0 ? "var(--green-soft)" : "var(--red)",
                sub: vsScenario > 0 ? "⚠️ חריגה" : "✅ בתוך תקציב",
              } : null,
            ].filter(Boolean).map((k: any) => (
              <div key={k.label} style={{ background: "var(--surface2)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 3 }}>{k.label}</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: k.color }}>{k.value}</div>
                {k.sub && <div style={{ fontSize: 12, color: k.color, marginTop: 2 }}>{k.sub}</div>}
              </div>
            ))}
          </div>

          {/* Category details */}
          {(catDetails.over.length > 0 || catDetails.under.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {catDetails.over.length > 0 && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--red)", marginBottom: 8 }}>🔴 חרגו מהממוצע</div>
                  {catDetails.over.map(c => (
                    <div key={c.cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 14 }}>
                      <span style={{ color: "var(--text)" }}>{c.cat}</span>
                      <span>
                        <span style={{ fontWeight: 700, color: "var(--red)" }}>{fmt(c.amount)}</span>
                        <span style={{ color: "var(--text-dim)", marginRight: 4 }}>
                          (+{Math.round(c.pctVsAvg)}% מממוצע)
                          {c.budget > 0 && <span style={{ color: "var(--red)" }}> תק׳: {fmt(c.budget)}</span>}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {catDetails.under.length > 0 && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--green-soft)", marginBottom: 8 }}>🟢 השתפרו</div>
                  {catDetails.under.map(c => (
                    <div key={c.cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 14 }}>
                      <span style={{ color: "var(--text)" }}>{c.cat}</span>
                      <span>
                        <span style={{ fontWeight: 700, color: "var(--green-soft)" }}>{fmt(c.amount)}</span>
                        <span style={{ color: "var(--text-dim)", marginRight: 4 }}>({Math.round(c.pctVsAvg)}% מממוצע)</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {selectedSummary && !selectedSummary.hasData && (
        <Card style={{ padding: "28px 20px", textAlign: "center", color: "var(--text-dim)", fontSize: 15 }}>
          אין נתונים ל{selectedSummary.label}
        </Card>
      )}
    </div>
  );
}

// Helper needed for ReferenceLine label
function mkLabelShort(mk: string): string {
  const SHORT = ["ינו׳","פב׳","מר׳","אפ׳","מאי","יוני","יול׳","אוג׳","ספ׳","אוק׳","נוב׳","דצ׳"];
  const [, m] = mk.split("-");
  return SHORT[+m - 1] ?? mk;
}
