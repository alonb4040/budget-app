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

  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "";
  const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "";
  const PROVIDERS: Provider[] = [
    { id: "max", name: "מקס", color: "#00c8aa", bookmarklet: makeBookmarkletMax(supabaseUrl, supabaseKey) },
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

          <div style={{ marginTop: 20, padding: "14px 18px", background: "var(--surface2)", borderRadius: 12, fontSize: 15, color: "var(--text-dim)", lineHeight: 1.7 }}>
            💡 ספקים נוספים (ישראכרט, כאל) — בקרוב
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
                style={{ padding: "12px 24px", background: "var(--green-mid)", color: "#fff", borderRadius: 10, fontWeight: 700, fontSize: 17, textDecoration: "none", cursor: "grab", border: "none", display: "inline-block" }}
                onClick={e => { e.preventDefault(); alert("גרור אותי לסרגל הסימניות — אל תלחץ!"); }}
              >
                📤 שלח למאזן
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
              4. התנועות יגיעו אוטומטית לאפליקציה ✅
            </div>
          </Card>

          {/* שלב 3 — מה שלא עובד */}
          <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 20, lineHeight: 1.7 }}>
            ⚠️ אם הסימניה לא עובדת — תמיד אפשר להמשיך להעלות קבצים ידנית כרגיל.
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={() => setStep("choose")} variant="ghost">← חזור</Btn>
            <Btn onClick={onBack}>סיימתי ←</Btn>
          </div>
        </div>
      )}

      {step === "result" && importResult && (
        <Card style={{ textAlign: "center", padding: "40px 32px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
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
