import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { Card, Btn, C } from "./ui";
import type { Session } from "./types";

interface ConnectCardScreenProps {
  session: Session;
  onBack: () => void;
}

interface Provider {
  id: string;
  name: string;
  color: string;
  bookmarklet: string;
}

interface ImportResult {
  added: number;
  duplicates: number;
}

function makeBookmarkletMax(supabaseUrl: string, supabaseKey: string): string {
  return `javascript:(function() { const SUPABASE_URL = '${supabaseUrl}'; const SUPABASE_KEY = '${supabaseKey}'; const clientId = localStorage.getItem('mazan_client_id'); if (!clientId) { alert('לא נמצא חשבון מחובר.\\nאנא כנס לאפליקציה מאזן תחילה, ואז נסה שוב.'); return; } const rows = Array.from(document.querySelectorAll('.row-stripes')); if (rows.length === 0) { alert('לא נמצאו תנועות בעמוד זה.\\nוודא שאתה בעמוד פירוט תנועות של מקס.'); return; } const transactions = []; rows.forEach(row => { const text = row.innerText.trim(); const lines = text.split('\\n').map(l => l.trim()).filter(Boolean); const dateMatch = lines.find(l => l.match(/^\\d{2}\\.\\d{2}\\.\\d{2}$/)); const amountMatch = lines.find(l => l.match(/\\u20aa[\\d,]+\\.?\\d*/)); const category = lines.find(l => l && !l.match(/\\d{2}\\.\\d{2}/) && !l.match(/\\u20aa/) && l.length > 2 && l.length < 30); const name = lines.find(l => l && !l.match(/^\\d{2}\\.\\d{2}\\.\\d{2}$/) && !l.match(/^\\u20aa/) && l !== category && l.length > 2); if (!dateMatch || !amountMatch) return; const [day, month, year] = dateMatch.split('.'); const fullYear = '20' + year; const dateFormatted = fullYear+'-'+month+'-'+day; const amount = parseFloat(amountMatch.replace(/\\u20aa/,'').replace(/,/g,'')); transactions.push({ date: dateFormatted, name: name || '', cat: category || '', amount: amount }); }); if (transactions.length === 0) { alert('לא הצלחתי לחלץ תנועות.\\nנסה שוב בעמוד פירוט תנועות.'); return; } const pageTitle = document.title || ''; const cardMatch = pageTitle.match(/\\d{4}/); const cardLast4 = cardMatch ? cardMatch[0] : 'xxxx'; const msg = document.createElement('div'); msg.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;background:#2d6a4f;color:white;padding:16px 24px;border-radius:12px;font-size:16px;font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.3);direction:rtl;'; msg.innerText = '\\u23f3 שולח '+transactions.length+' תנועות למאזן...'; document.body.appendChild(msg); fetch(SUPABASE_URL+'/functions/v1/manage-auth',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+SUPABASE_KEY},body:JSON.stringify({action:'bookmarklet_import',client_id:parseInt(clientId),source:'max_bookmarklet',card_last4:cardLast4,transactions})}).then(r=>r.json()).then(data=>{msg.remove();if(data.added!==undefined){alert('\\u2705 '+data.added+' תנועות נוספו למאזן!'+(data.duplicates>0?'\\n'+data.duplicates+' כפילויות דולגו.':''));}else{alert('\\u274c '+( data.error||'שגיאה'));}}).catch(e=>{msg.remove();alert('\\u274c שגיאה: '+e.message);}); })();`;
}

export default function ConnectCardScreen({ session, onBack }: ConnectCardScreenProps) {
  const [step, setStep] = useState<"choose" | "instructions" | "result">("choose");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showMaxSyncInstructions, setShowMaxSyncInstructions] = useState(false);

  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "";
  const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "";
  const PROVIDERS: Provider[] = [
    { id: "max", name: "מקס", color: "var(--green-mid)", bookmarklet: makeBookmarkletMax(supabaseUrl, supabaseKey) },
  ];

  // בדיקה אם הגיע import מהבוקמרקלט (דרך URL params)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const data = params.get("bookmarklet_data");
    if (data) {
      try {
        const parsed = JSON.parse(decodeURIComponent(data));
        setImportResult(parsed);
        setStep("result");
        window.history.replaceState({}, "", window.location.pathname);
      } catch(e) {}
    }
  }, []);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <Btn variant="ghost" size="sm" onClick={onBack}>← חזור</Btn>
        <div style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 24, fontWeight: 600, color: "var(--green-deep)" }}>
          חיבור כרטיס אשראי
        </div>
      </div>

      {step === "choose" && (
        <div>
          <div style={{ fontSize: 17, color: "var(--text-mid)", marginBottom: 24, lineHeight: 1.7 }}>
            במקום להוריד קבצים ולהעלות אותם — תוכל לשלוח תנועות ישירות מאתר חברת האשראי בלחיצה אחת.
          </div>

          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, color: "var(--text-dim)" }}>בחר ספק:</div>

          {PROVIDERS.map(p => (
            <Card key={p.id} style={{ marginBottom: 12, cursor: "pointer", border: "2px solid var(--border)", transition: "all 0.15s" }}
              onClick={() => { setProvider(p); setStep("instructions"); }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: p.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 18 }}>
                  {p.name}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{p.name}</div>
                  <div style={{ fontSize: 15, color: "var(--text-dim)" }}>לחץ להגדרה חד-פעמית</div>
                </div>
                <div style={{ marginRight: "auto", fontSize: 22, color: "var(--text-dim)" }}>←</div>
              </div>
            </Card>
          ))}

          <div style={{ marginTop: 20, padding: "14px 18px", background: "var(--surface2)", borderRadius: 12, fontSize: 15, color: "var(--text-dim)", lineHeight: 1.7, display:"flex", alignItems:"center", gap:8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            ספקים נוספים (ישראכרט, כאל) — בקרוב
          </div>

          {/* Tampermonkey Sync — recommended */}
          <div style={{ marginTop: 28 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, color: 'var(--text-dim)', display:"flex", alignItems:"center", gap:6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              סנכרון אוטומטי — מומלץ
            </div>
            <Card style={{ border: (session as any).max_last_sync ? '2px solid var(--green-soft)' : '2px solid var(--green-mid)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: (session as any).max_last_sync ? 'var(--green-mint)' : 'var(--green-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green-mid)' }}>
                  {(session as any).max_last_sync
                    ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  }
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>מאזן MAX Sync</div>
                  <div style={{ fontSize: 14, color: 'var(--text-dim)', marginTop: 2 }}>
                    {(session as any).max_last_sync
                      ? `סנכרון MAX אחרון: ${new Date((session as any).max_last_sync).toLocaleDateString('he-IL')}`
                      : 'התקנה חד-פעמית · עדכון אוטומטי · ללא תשלום'}
                  </div>
                </div>
                {!(session as any).max_last_sync && (
                  <Btn size="sm" onClick={() => setShowMaxSyncInstructions(v => !v)}>הגדר ←</Btn>
                )}
              </div>

              {showMaxSyncInstructions && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>התקנה חד-פעמית — 2 שלבים:</div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--green-mid)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0, fontSize: 13 }}>1</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>התקן Tampermonkey</div>
                        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>תוסף חינמי מה-Chrome Web Store</div>
                        <a href="https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo"
                          target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-block', marginTop: 6, padding: '5px 12px', background: 'var(--green-mid)', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                          פתח בחנות Chrome ←
                        </a>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--green-mid)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0, fontSize: 13 }}>2</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>התקן את סקריפט מאזן MAX</div>
                        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>Tampermonkey יזהה אוטומטית ויציע התקנה</div>
                        <a href="/mazan-max.user.js"
                          target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-block', marginTop: 6, padding: '5px 12px', background: 'var(--green-mid)', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                          התקן סקריפט מאזן MAX ←
                        </a>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6, display:"flex", alignItems:"flex-start", gap:6 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green-soft)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:2 }}><polyline points="20 6 9 17 4 12"/></svg>
                    <span>אחרי ההתקנה — כנס לאתר MAX, עבור לפירוט חיובים, ולחץ על כפתור <strong>מאזן MAX</strong> שמופיע בתחתית הדף</span>
                  </div>
                  <div style={{ marginTop: 8, padding: '8px 14px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text-dim)', display:"flex", alignItems:"center", gap:6 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    הסיסמה שלך לא מועברת למאזן — רק נתוני העסקאות
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {step === "instructions" && provider && (
        <div>
          <div style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 22, fontWeight: 600, marginBottom: 20, color: "var(--green-deep)" }}>
            הגדרת {provider.name} — פעם אחת בלבד
          </div>

          {/* שלב 1 */}
          <Card style={{ marginBottom: 16, borderRight: "4px solid var(--green-mid)" }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>שלב 1 — גרור את הכפתור לסרגל הסימניות</div>
            <div style={{ fontSize: 15, color: "var(--text-mid)", marginBottom: 16, lineHeight: 1.7 }}>
              גרור את הכפתור הכחול למטה לסרגל הסימניות של הדפדפן שלך (הפס העליון עם הכוכבית ⭐)
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px", background: "var(--surface2)", borderRadius: 12 }}>
              <a
                href={provider.bookmarklet}
                style={{ padding: "12px 24px", background: "var(--green-mid)", color: "#fff", borderRadius: 10, fontWeight: 700, fontSize: 17, textDecoration: "none", cursor: "grab", border: "none", display: "inline-flex", alignItems: "center", gap: 8 }}
                onClick={e => { e.preventDefault(); alert("גרור אותי לסרגל הסימניות — אל תלחץ!"); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                שלח למאזן
              </a>
              <div style={{ fontSize: 15, color: "var(--text-dim)", flex: 1 }}>
                ← גרור את הכפתור הזה לסרגל הסימניות
              </div>
            </div>
            <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 10 }}>
              אם הסרגל לא נראה: Ctrl+Shift+B (Windows) או Cmd+Shift+B (Mac)
            </div>
          </Card>

          {/* שלב 2 */}
          <Card style={{ marginBottom: 16, borderRight: "4px solid var(--green-soft)" }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>שלב 2 — כל חודש מעכשיו</div>
            <div style={{ fontSize: 15, color: "var(--text-mid)", lineHeight: 1.9 }}>
              1. היכנס לאתר מקס<br/>
              2. לך לעמוד פירוט תנועות של הכרטיס<br/>
              3. לחץ על <strong>"שלח למאזן"</strong> בסרגל הסימניות<br/>
              4. התנועות יגיעו אוטומטית לאפליקציה
            </div>
          </Card>

          {/* שלב 3 — מה שלא עובד */}
          <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 20, lineHeight: 1.7, display:"flex", alignItems:"center", gap:6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            אם הסימניה לא עובדת — תמיד אפשר להמשיך להעלות קבצים ידנית כרגיל.
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={() => setStep("choose")} variant="ghost">← חזור</Btn>
            <Btn onClick={onBack}>סיימתי ←</Btn>
          </div>
        </div>
      )}

      {step === "result" && importResult && (
        <Card style={{ textAlign: "center", padding: "40px 32px" }}>
          <div style={{ marginBottom: 16, display:"flex", justifyContent:"center" }}><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--green-soft)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <div style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 26, fontWeight: 600, color: "var(--green-deep)", marginBottom: 8 }}>
            {importResult.added} תנועות נוספו
          </div>
          {importResult.duplicates > 0 && (
            <div style={{ fontSize: 16, color: "var(--text-dim)", marginBottom: 16 }}>
              {importResult.duplicates} כפילויות דולגו
            </div>
          )}
          <Btn onClick={onBack}>חזור לדשבורד</Btn>
        </Card>
      )}
    </div>
  );
}
