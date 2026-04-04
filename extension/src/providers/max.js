chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'extractTransactions') return;
  setTimeout(() => {
    const result = extractMaxTransactions(msg.userId, msg.provider);
    sendResponse(result);
  }, 1500);
  return true;
});

function extractMaxTransactions(userId, provider) {
  const wrappers = Array.from(document.querySelectorAll('.table-wrapper'));
  if (wrappers.length === 0) {
    return { success: false, error: 'לא נמצאו תנועות. נסה לנווט לעמוד פירוט תנועות.' };
  }

  const transactions = [];
  const cardLast4 = extractCardLast4();

  wrappers.forEach(wrapper => {
    const txs = parseWrapper(wrapper);
    transactions.push(...txs);
  });

  if (transactions.length === 0) {
    return { success: false, error: 'לא הצלחתי לחלץ תנועות — נסה שוב' };
  }

  chrome.runtime.sendMessage({
    action: 'transactionsExtracted',
    transactions, userId, provider, cardLast4,
  });

  return { success: true, added: transactions.length, duplicates: 0 };
}

// מבנה שורה במקס (מאומת מ-DevTools):
// [0] ת.עסקה [1] שם בית העסק [2] קטגוריה [3] כרטיס [4] סוג עסקה [5] סכום  <- כותרת
// [6] DD.MM.YY [7] סוג [8] קטגוריה [9] כרטיס# [10] סוג [11] ₪ [12] ₪סכום
// כלומר: תאריך → שם → קטגוריה → כרטיס → סוג → ₪ → ₪סכום
function parseWrapper(wrapper) {
  const results = [];
  const allLines = wrapper.innerText.split('\n').map(l => l.trim());
  
  // סנן שורות ריקות לגמרי אבל שמור ₪ ריק כסמן
  const lines = allLines.filter(l => l.length > 0);

  let i = 0;
  
  // דלג על שורת כותרת
  while (i < lines.length && (lines[i].includes('ת.עסקה') || lines[i] === 'שם בית העסק' || lines[i] === 'סכום')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i];

    // תאריך: DD.MM.YY בדיוק 8 תווים
    if (/^\d{2}\.\d{2}\.\d{2}$/.test(line)) {
      const [day, month, year] = line.split('.');
      const date = '20' + year + '-' + month + '-' + day;

      // המבנה: date, name, category, card#, type, ₪, ₪amount
      const name        = lines[i + 1] || '';
      const maxCategory = lines[i + 2] || '';
      // lines[i+3] = card number (4 digits)
      // lines[i+4] = סוג עסקה (רגילה וכו')
      // lines[i+5] = ₪ (ריק או סמן)
      // lines[i+6] = ₪סכום בפועל

      // חפש את הסכום — השורה הראשונה שמתחילה ב-₪ ומכילה מספר
      let amount = 0;
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const l = lines[j];
        // ₪ + מספר ממשי — לא תאריך
        const m = l.match(/^₪([\d,]+\.?\d*)$/);
        if (m) {
          const num = parseFloat(m[1].replace(/,/g, ''));
          if (!isNaN(num) && num > 0 && num < 100000) {
            amount = num;
            break;
          }
        }
      }

      // שם ולא כרטיס — וודא שהשם לא ספרות בלבד (כרטיס)
      const cleanName = /^\d{4}$/.test(name) ? (lines[i + 2] || '') : name;

      if (cleanName && cleanName.length > 1 && amount > 0) {
        results.push({ date, name: cleanName, amount, maxCategory });
      }
    }
    i++;
  }

  return results;
}

function extractCardLast4() {
  const match = document.body.innerText.match(/max\s+\S+\s+(\d{4})/i);
  return match ? match[1] : null;
}
