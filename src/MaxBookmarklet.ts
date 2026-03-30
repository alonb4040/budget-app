// ── Bookmarklet source — יש לmify לפני שליחה ─────────────────────────────
// הקוד הזה רץ על אתר מקס כשהמשתמש לוחץ על הסימניה
export {};

(function() {
  const APP_URL = 'https://symphonious-strudel-4b95e6.netlify.app';

  // --- מצא את כל שורות התנועות ---
  const rows = Array.from(document.querySelectorAll('.row-stripes'));
  
  if (rows.length === 0) {
    alert('לא נמצאו תנועות בעמוד זה. וודא שאתה בעמוד פירוט תנועות של מקס.');
    return;
  }

  const transactions = [];

  rows.forEach(row => {
    const text = (row as HTMLElement).innerText.trim();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    
    // מבנה שורה: תאריך | שם עסק | קטגוריה | סכום
    // לפי מה שראינו: "15.03.26\nPAYPAL *TRADINGVIEW...\nעירייה וממשלה\n₪48.47"
    const dateMatch = lines.find(l => l.match(/^\d{2}\.\d{2}\.\d{2}$/));
    const amountMatch = lines.find(l => l.match(/₪[\d,]+\.?\d*/));
    const category = lines.find(l => l && !l.match(/\d{2}\.\d{2}/) && !l.match(/₪/) && l.length > 2 && l.length < 30);
    const name = lines.find(l => l && !l.match(/^\d{2}\.\d{2}\.\d{2}$/) && !l.match(/^₪/) && l !== category && l.length > 2);

    if (!dateMatch || !amountMatch) return;

    // המר תאריך DD.MM.YY → YYYY-MM-DD
    const [day, month, year] = dateMatch.split('.');
    const fullYear = '20' + year;
    const dateFormatted = `${fullYear}-${month}-${day}`;

    // המר סכום ₪1,234.56 → 1234.56
    const amount = parseFloat(amountMatch.replace('₪', '').replace(/,/g, ''));

    transactions.push({
      date: dateFormatted,
      name: name || '',
      cat: category || '',
      amount: amount,
      source: 'max_bookmarklet',
    });
  });

  if (transactions.length === 0) {
    alert('לא הצלחתי לחלץ תנועות. נסה שוב בעמוד פירוט תנועות.');
    return;
  }

  // --- קרא את מספר הכרטיס מהעמוד ---
  const cardEl = document.querySelector('[class*="card-name"], [class*="cardName"]');
  const pageTitle = document.title || '';
  const cardMatch = pageTitle.match(/\d{4}/);
  const cardLast4 = cardMatch ? cardMatch[0] : 'xxxx';

  // --- שלח לאפליקציה ---
  const payload = {
    source: 'max',
    card_last4: cardLast4,
    transactions,
  };

  // פתח חלון קטן עם הנתונים לשליחה
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = APP_URL + '/api/bookmarklet-import';
  form.target = '_blank';

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'data';
  input.value = JSON.stringify(payload);
  form.appendChild(input);

  // הוסף token אם קיים ב-localStorage
  const token = localStorage.getItem('mazan_token') || '';
  const tokenInput = document.createElement('input');
  tokenInput.type = 'hidden';
  tokenInput.name = 'token';
  tokenInput.value = token;
  form.appendChild(tokenInput);

  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);

  // הצג הודעה
  const msg = document.createElement('div');
  msg.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 99999;
    background: #2d6a4f; color: white; padding: 16px 24px;
    border-radius: 12px; font-size: 16px; font-family: sans-serif;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3); direction: rtl;
  `;
  msg.innerText = `✅ נשלחו ${transactions.length} תנועות למאזן`;
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 4000);
})();
