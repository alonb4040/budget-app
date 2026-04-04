// ── ישראכרט Content Script ────────────────────────────────────────────────────
// מבנה דומה למקס — יש להתאים אחרי בדיקה אמיתית של אתר ישראכרט

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'extractTransactions') return;
  setTimeout(() => {
    const result = extractIsracardTransactions(msg.userId, msg.provider);
    sendResponse(result);
  }, 2000);
  return true;
});

function extractIsracardTransactions(userId, provider) {
  // ישראכרט משתמש ב-Angular גם כן — צריך לבדוק את ה-class הנכון
  // TODO: לחפש את class הנכון ב-devtools של ישראכרט
  const rows = Array.from(document.querySelectorAll('[class*="transaction-row"], [class*="TransactionRow"], tbody tr'));

  if (rows.length === 0) {
    return { success: false, error: 'לא נמצאו תנועות', needsNavigation: true };
  }

  const transactions = rows.map(row => {
    const cells = Array.from(row.querySelectorAll('td, [class*="cell"]'));
    if (cells.length < 3) return null;
    const texts = cells.map(c => c.innerText.trim()).filter(Boolean);
    const dateMatch  = texts.find(t => /\d{2}\/\d{2}\/\d{4}/.test(t));
    const amountMatch = texts.find(t => /[\d,]+\.\d{2}/.test(t));
    if (!dateMatch || !amountMatch) return null;
    const [day, month, year] = dateMatch.split('/');
    return {
      date:   year + '-' + month + '-' + day,
      name:   texts[1] || '',
      amount: parseFloat(amountMatch.replace(/,/g, '')) || 0,
    };
  }).filter(Boolean);

  chrome.runtime.sendMessage({
    action: 'transactionsExtracted',
    transactions,
    userId,
    provider,
    cardLast4: null,
  });

  return { success: true, added: transactions.length, duplicates: 0 };
}
