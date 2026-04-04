/**
 * supabase-health.js
 * Standalone Node.js health check for the budget-app Supabase database.
 * Uses native fetch (Node 18+). No Playwright required.
 * Usage: node tests/supabase-health.js
 */

const SUPABASE_URL = 'https://fygffuihotnkjmxmveyt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_F7Eye_7vlhjDzF50Ei5Sgw_9QG7iDJP';

// ── Color helpers ──────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  red:   '\x1b[31m',
  green: '\x1b[32m',
  yellow:'\x1b[33m',
  cyan:  '\x1b[36m',
  gray:  '\x1b[90m',
};

function ok(msg)   { console.log(`${C.green}✅ ${msg}${C.reset}`); }
function warn(msg) { console.log(`${C.yellow}⚠️  ${msg}${C.reset}`); }
function fail(msg) { console.log(`${C.red}❌ ${msg}${C.reset}`); }
function info(msg) { console.log(`${C.cyan}ℹ️  ${msg}${C.reset}`); }
function section(title) {
  console.log('');
  console.log(`${C.bold}${C.cyan}── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}${C.reset}`);
}

// ── Supabase REST helpers ─────────────────────────────────────────────────
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function sbFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, { headers: HEADERS, ...options });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = text; }
  return { status: res.status, data };
}

async function countTable(table) {
  const { status, data } = await sbFetch(`${table}?select=id&limit=1`, {
    headers: { ...HEADERS, 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' },
  });
  // Supabase returns count in Content-Range header; we need a HEAD-style request
  // Use select=count(*) approach via RPC or just fetch all IDs with count header
  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id`, {
    headers: { ...HEADERS, 'Prefer': 'count=exact' },
    method: 'HEAD',
  });
  const contentRange = res2.headers.get('content-range');
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)$/);
    if (match) return parseInt(match[1], 10);
  }
  // Fallback: fetch all and count
  const { data: rows } = await sbFetch(`${table}?select=id`);
  return Array.isArray(rows) ? rows.length : -1;
}

// ── Main health check ────────────────────────────────────────────────────
let errorCount = 0;

async function main() {
  console.log('');
  console.log(`${C.bold}${C.cyan}╔══════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║   Budget App – Supabase Health Check         ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════╝${C.reset}`);
  console.log(`  Project : budget-app`);
  console.log(`  URL     : ${SUPABASE_URL}`);
  console.log(`  Time    : ${new Date().toISOString()}`);

  // ── 1. Connectivity check ─────────────────────────────────────────────
  section('1. Connectivity');
  try {
    const { status, data } = await sbFetch('clients?select=id&limit=1');
    if (status === 200 || status === 206) {
      ok(`Connected to Supabase (HTTP ${status})`);
    } else if (status === 401 || status === 403) {
      fail(`Auth error – check SUPABASE_KEY (HTTP ${status})`);
      errorCount++;
    } else {
      warn(`Unexpected status ${status}`);
    }
  } catch (e) {
    fail(`Cannot connect to Supabase: ${e.message}`);
    errorCount++;
    console.log('\nAborting – no connection.');
    process.exit(1);
  }

  // ── 2. Table counts ───────────────────────────────────────────────────
  section('2. Table Row Counts');
  const TABLES = [
    'clients',
    'submissions',
    'month_entries',
    'imported_transactions',
    'import_batches',
    'scenarios',
    'payslips',
    'remembered_mappings',
    'portfolio_months',
    'portfolio_submissions',
  ];

  const tableCounts = {};
  for (const table of TABLES) {
    try {
      const count = await countTable(table);
      tableCounts[table] = count;
      if (count === -1) {
        warn(`${table.padEnd(28)} — count unavailable (table may not exist)`);
      } else {
        ok(`${table.padEnd(28)} ${String(count).padStart(6)} rows`);
      }
    } catch (e) {
      warn(`${table.padEnd(28)} — error: ${e.message}`);
      tableCounts[table] = -1;
    }
  }

  // ── 3. Data quality: imported_transactions with NULL billing_month ────
  section('3. Data Quality – NULL billing_month');
  try {
    const { status, data } = await sbFetch('imported_transactions?billing_month=is.null&select=id,name,date,client_id');
    if (!Array.isArray(data)) {
      warn(`Could not query imported_transactions: ${JSON.stringify(data)}`);
    } else if (data.length === 0) {
      ok('No imported_transactions with NULL billing_month');
    } else {
      fail(`${data.length} imported_transactions have NULL billing_month (data quality issue)`);
      errorCount++;
      // Show first 5
      data.slice(0, 5).forEach(tx => {
        console.log(`  ${C.gray}  id=${tx.id}  name="${tx.name}"  date=${tx.date}  client=${tx.client_id}${C.reset}`);
      });
      if (data.length > 5) console.log(`  ${C.gray}  ... and ${data.length - 5} more${C.reset}`);
    }
  } catch (e) {
    warn(`Could not check NULL billing_month: ${e.message}`);
  }

  // ── 4. Duplicate tx_hash values ───────────────────────────────────────
  section('4. Data Quality – Duplicate tx_hash');
  try {
    // Fetch all tx_hash values
    const { status, data } = await sbFetch('imported_transactions?select=tx_hash,id,client_id');
    if (!Array.isArray(data)) {
      warn(`Could not query tx_hash values: ${JSON.stringify(data)}`);
    } else {
      const hashCounts = {};
      for (const row of data) {
        if (!row.tx_hash) continue;
        const key = `${row.client_id}|${row.tx_hash}`;
        hashCounts[key] = (hashCounts[key] || 0) + 1;
      }
      const dupes = Object.entries(hashCounts).filter(([k, v]) => v > 1);
      if (dupes.length === 0) {
        ok('No duplicate tx_hash values found');
      } else {
        fail(`${dupes.length} duplicate tx_hash combinations found (dedup problem)`);
        errorCount++;
        dupes.slice(0, 5).forEach(([key, count]) => {
          console.log(`  ${C.gray}  ${key} → ${count} occurrences${C.reset}`);
        });
      }
    }
  } catch (e) {
    warn(`Could not check tx_hash duplicates: ${e.message}`);
  }

  // ── 5. Client list with submission counts ────────────────────────────
  section('5. Clients');
  try {
    const { status, data: clients } = await sbFetch('clients?select=id,name,username');
    if (!Array.isArray(clients)) {
      warn(`Could not fetch clients: ${JSON.stringify(clients)}`);
    } else {
      ok(`Total clients: ${clients.length}`);
      for (const client of clients) {
        // Count submissions for this client
        const { data: subs } = await sbFetch(`submissions?client_id=eq.${client.id}&select=id`);
        const subCount = Array.isArray(subs) ? subs.length : '?';
        console.log(`  ${C.gray}  id=${client.id}  username="${client.username}"  name="${client.name}"  submissions=${subCount}${C.reset}`);
      }
    }
  } catch (e) {
    warn(`Could not list clients: ${e.message}`);
  }

  // ── 6. Security: admin password check ───────────────────────────────
  section('6. Security Checks');
  try {
    const { data: adminRows } = await sbFetch('clients?username=eq.admin&select=id,username,password');
    if (!Array.isArray(adminRows) || adminRows.length === 0) {
      info('No "admin" user found (may be managed separately)');
    } else {
      const admin = adminRows[0];
      if (admin.password === 'admin123') {
        fail('Admin password is still default "admin123" — SECURITY RISK!');
        errorCount++;
      } else if (admin.password) {
        ok('Admin password has been changed from default');
      } else {
        warn('Admin password field is empty or null');
      }
    }
  } catch (e) {
    warn(`Could not check admin password: ${e.message}`);
  }

  // ── 7. Weak passwords: clients whose password == username ───────────
  try {
    const { data: allClients } = await sbFetch('clients?select=id,username,password,name');
    if (Array.isArray(allClients)) {
      const weak = allClients.filter(c => c.password && c.username && c.password === c.username);
      if (weak.length === 0) {
        ok('No clients have password equal to username');
      } else {
        warn(`${weak.length} client(s) have password equal to username (weak password)`);
        weak.forEach(c => {
          console.log(`  ${C.gray}  username="${c.username}"  name="${c.name}"${C.reset}`);
        });
      }
    }
  } catch (e) {
    warn(`Could not check weak passwords: ${e.message}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────
  section('Summary');
  if (errorCount === 0) {
    ok(`All checks passed — no critical issues found`);
  } else {
    fail(`${errorCount} critical issue(s) found — see ❌ above`);
  }
  console.log('');

  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(`${C.red}Fatal error: ${e.message}${C.reset}`);
  console.error(e.stack);
  process.exit(1);
});
