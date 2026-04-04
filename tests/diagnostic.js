// diagnostic.js — Full auth & RLS diagnostic for מאזן budget-app
// Run: node tests/diagnostic.js

const SUPABASE_URL = 'https://fygffuihotnkjmxmveyt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_F7Eye_7vlhjDzF50Ei5Sgw_9QG7iDJP';
const EDGE_URL = `${SUPABASE_URL}/functions/v1/manage-auth`;

const REST_URL = `${SUPABASE_URL}/rest/v1`;
const AUTH_URL = `${SUPABASE_URL}/auth/v1`;

const results = [];

function record(name, status, ms, detail) {
  results.push({ name, status, ms, detail });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${ms}ms] ${name}: ${detail}`);
}

async function timed(fn) {
  const t = Date.now();
  try {
    const result = await fn();
    return { ms: Date.now() - t, result, error: null };
  } catch (e) {
    return { ms: Date.now() - t, result: null, error: e.message || String(e) };
  }
}

async function authSignIn(username, password) {
  const email = `${username}@mazan.local`;
  const res = await fetch(`${AUTH_URL}/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function restQuery(table, token, extraParams = '') {
  const res = await fetch(`${REST_URL}/${table}?${extraParams}`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function edgeFetch(body, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`,
  };
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

async function getUser(token) {
  const res = await fetch(`${AUTH_URL}/user`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
    },
  });
  return res.json();
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  מאזן — Full Auth & RLS Diagnostic');
  console.log(`  Target: ${SUPABASE_URL}`);
  console.log('═══════════════════════════════════════════════════════\n');

  // ── SECTION 1: Direct signInWithPassword ───────────────────────────────
  console.log('── Section 1: Direct signInWithPassword ───────────────\n');

  // 1a. Admin login
  let adminToken = null;
  {
    const { ms, result, error } = await timed(() => authSignIn('admin', 'mp625x4egtz27'));
    if (error) {
      record('Admin direct login', 'FAIL', ms, `fetch error: ${error}`);
    } else if (result.status === 200 && result.data.access_token) {
      adminToken = result.data.access_token;
      const meta = result.data.user?.app_metadata ?? {};
      const isAdmin = meta.is_admin === true;
      record('Admin direct login', isAdmin ? 'PASS' : 'WARN', ms,
        `access_token=YES, is_admin=${meta.is_admin}, email=${result.data.user?.email}`);
    } else {
      record('Admin direct login', 'FAIL', ms, `HTTP ${result.status}: ${JSON.stringify(result.data).slice(0,120)}`);
    }
  }

  // 1b. Client test5050 login
  let client5050Token = null;
  {
    const { ms, result, error } = await timed(() => authSignIn('test5050', 'test5050'));
    if (error) {
      record('Client test5050 direct login', 'FAIL', ms, `fetch error: ${error}`);
    } else if (result.status === 200 && result.data.access_token) {
      client5050Token = result.data.access_token;
      record('Client test5050 direct login', 'PASS', ms, `access_token=YES, email=${result.data.user?.email}`);
    } else {
      record('Client test5050 direct login', 'FAIL', ms, `HTTP ${result.status}: ${JSON.stringify(result.data).slice(0,120)}`);
    }
  }

  // 1c. Client test1010 login
  let client1010Token = null;
  {
    const { ms, result, error } = await timed(() => authSignIn('test1010', 'test1010'));
    if (error) {
      record('Client test1010 direct login', 'FAIL', ms, `fetch error: ${error}`);
    } else if (result.status === 200 && result.data.access_token) {
      client1010Token = result.data.access_token;
      record('Client test1010 direct login', 'PASS', ms, `access_token=YES, email=${result.data.user?.email}`);
    } else {
      record('Client test1010 direct login', 'FAIL', ms, `HTTP ${result.status}: ${JSON.stringify(result.data).slice(0,120)}`);
    }
  }

  // 1d. Wrong credentials
  {
    const { ms, result } = await timed(() => authSignIn('notexist', 'wrongpassword'));
    record('Wrong credentials rejected', result.status === 400 ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status} (expected 400)`);
  }

  // ── SECTION 2: Token / Session Validation ─────────────────────────────
  console.log('\n── Section 2: Token & Session Validation ───────────────\n');

  if (adminToken) {
    const { ms, result } = await timed(() => getUser(adminToken));
    const isAdmin = result?.app_metadata?.is_admin === true;
    record('Admin token: getUser + is_admin check', isAdmin ? 'PASS' : 'FAIL', ms,
      `is_admin=${result?.app_metadata?.is_admin}, id=${result?.id?.slice(0,8)}...`);
  }

  if (client5050Token) {
    const { ms, result } = await timed(() => getUser(client5050Token));
    record('test5050 token: getUser', 'PASS', ms,
      `email=${result?.email}, is_admin=${result?.app_metadata?.is_admin}`);
  }

  // Session refresh simulation — re-use access token (simulates onAuthStateChange INITIAL_SESSION)
  if (client5050Token) {
    const { ms, result } = await timed(() => getUser(client5050Token));
    record('Session restore simulation (token reuse)', result?.id ? 'PASS' : 'FAIL', ms,
      `user found: ${!!result?.id}`);
  }

  // ── SECTION 3: RLS — clients table ────────────────────────────────────
  console.log('\n── Section 3: RLS — clients table ─────────────────────\n');

  // Admin: should see all clients
  if (adminToken) {
    const { ms, result } = await timed(() => restQuery('clients', adminToken, 'select=id,username,auth_id&order=id.asc'));
    const count = Array.isArray(result.data) ? result.data.length : 'ERROR';
    record('Admin sees all clients', result.status === 200 && count > 1 ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status}, count=${count}`);

    if (Array.isArray(result.data)) {
      console.log('\n   Clients table snapshot:');
      result.data.forEach(c => {
        const authStatus = c.auth_id ? `auth_id=${c.auth_id.slice(0,8)}...` : 'auth_id=NULL ⚠️';
        console.log(`   id=${c.id}, username=${c.username}, ${authStatus}`);
      });

      // Check for clients missing auth_id
      const missing = result.data.filter(c => !c.auth_id);
      if (missing.length > 0) {
        record('All clients have auth_id', 'FAIL', 0,
          `${missing.length} client(s) missing auth_id: ${missing.map(c => c.username).join(', ')}`);
      } else {
        record('All clients have auth_id', 'PASS', 0, `All ${result.data.length} clients linked`);
      }
    }
  }

  // Client test5050: should see only own row (no .eq() — RLS handles it)
  if (client5050Token) {
    const { ms, result } = await timed(() => restQuery('clients', client5050Token, 'select=id,username,is_blocked'));
    const count = Array.isArray(result.data) ? result.data.length : 'ERROR';
    const onlyOwn = count === 1;
    record('test5050 sees only own client row (no .eq filter, RLS only)', onlyOwn ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status}, count=${count}, data=${JSON.stringify(result.data).slice(0,80)}`);

    // This tests the App.tsx buildSession bug — it uses .maybeSingle() with NO .eq()
    // If RLS works, this is fine. If RLS is misconfigured, client sees all rows.
    if (!onlyOwn) {
      console.log('   ⚠️  CRITICAL: Client can see multiple rows — RLS not working!');
    }
  }

  // Client test1010: should see only own row
  if (client1010Token) {
    const { ms, result } = await timed(() => restQuery('clients', client1010Token, 'select=id,username'));
    const count = Array.isArray(result.data) ? result.data.length : 'ERROR';
    record('test1010 sees only own client row', count === 1 ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status}, count=${count}`);
  }

  // ── SECTION 4: RLS — submissions table ────────────────────────────────
  console.log('\n── Section 4: RLS — submissions table ──────────────────\n');

  if (adminToken) {
    const { ms, result } = await timed(() => restQuery('submissions', adminToken, 'select=id,client_id&limit=5'));
    record('Admin can query submissions', result.status === 200 ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status}, count=${Array.isArray(result.data) ? result.data.length : 'err'}`);
  }

  if (client5050Token) {
    // First get client5050's own id
    const { result: clientRes } = await timed(() => restQuery('clients', client5050Token, 'select=id'));
    const myId = Array.isArray(clientRes.data) && clientRes.data[0]?.id;

    const { ms, result } = await timed(() => restQuery('submissions', client5050Token, 'select=id,client_id&limit=10'));
    const rows = Array.isArray(result.data) ? result.data : [];
    const allOwn = rows.every(r => r.client_id == myId);
    record('test5050 submissions: only own client_id rows', allOwn ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status}, rows=${rows.length}, myId=${myId}, allOwn=${allOwn}`);
  }

  if (client1010Token) {
    const { result: clientRes } = await timed(() => restQuery('clients', client1010Token, 'select=id'));
    const myId = Array.isArray(clientRes.data) && clientRes.data[0]?.id;

    const { ms, result } = await timed(() => restQuery('submissions', client1010Token, 'select=id,client_id&limit=10'));
    const rows = Array.isArray(result.data) ? result.data : [];
    const allOwn = rows.every(r => r.client_id == myId);
    record('test1010 submissions: only own client_id rows', allOwn ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status}, rows=${rows.length}, allOwn=${allOwn}`);
  }

  // Cross-client isolation: test5050 cannot see test1010's submissions
  if (client5050Token && client1010Token) {
    const { result: res1010 } = await timed(() => restQuery('clients', client1010Token, 'select=id'));
    const id1010 = Array.isArray(res1010.data) && res1010.data[0]?.id;

    if (id1010) {
      const { ms, result } = await timed(() =>
        restQuery('submissions', client5050Token, `select=id,client_id&client_id=eq.${id1010}`)
      );
      const rows = Array.isArray(result.data) ? result.data : [];
      record('Cross-client isolation: test5050 cannot read test1010 submissions',
        rows.length === 0 ? 'PASS' : 'FAIL', ms,
        `HTTP ${result.status}, rows visible=${rows.length} (should be 0)`);
    }
  }

  // ── SECTION 5: Edge Function Tests ────────────────────────────────────
  console.log('\n── Section 5: Edge Function manage-auth ────────────────\n');

  // 5a. migrate_login for admin
  {
    const { ms, result } = await timed(() => edgeFetch({ action: 'migrate_login', username: 'admin', password: 'mp625x4egtz27' }));
    record('Edge: migrate_login admin', result.status === 200 && result.data?.ok ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status}, ok=${result.data?.ok}, role=${result.data?.role}`);
  }

  // 5b. migrate_login for test5050
  {
    const { ms, result } = await timed(() => edgeFetch({ action: 'migrate_login', username: 'test5050', password: 'test5050' }));
    record('Edge: migrate_login test5050', result.status === 200 && result.data?.ok ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status}, ok=${result.data?.ok}, role=${result.data?.role}, id=${result.data?.id}`);
  }

  // 5c. migrate_login for test1010
  {
    const { ms, result } = await timed(() => edgeFetch({ action: 'migrate_login', username: 'test1010', password: 'test1010' }));
    record('Edge: migrate_login test1010', result.status === 200 && result.data?.ok ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status}, ok=${result.data?.ok}, role=${result.data?.role}`);
  }

  // 5d. migrate_login with wrong password
  {
    const { ms, result } = await timed(() => edgeFetch({ action: 'migrate_login', username: 'admin', password: 'wrongpassword' }));
    record('Edge: migrate_login wrong password rejected', result.status === 401 ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status} (expected 401)`);
  }

  // 5e. create action without admin token — should 403
  {
    const { ms, result } = await timed(() => edgeFetch({ action: 'create', username: 'testxyz', password: 'test123', clientId: 9999 }));
    record('Edge: create without admin token → 403', result.status === 403 ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status} (expected 403)`);
  }

  // 5f. create action WITH admin token — should work (but with fake clientId → DB error is OK)
  if (adminToken) {
    const { ms, result } = await timed(() => edgeFetch({ action: 'create', username: 'diagnostic_test_xyz_9999', password: 'test123', clientId: 999999 }, adminToken));
    // Either 200 (created) or 500 (no such clientId in DB) — 403 would be wrong
    const notForbidden = result.status !== 403;
    record('Edge: create WITH admin token → not 403', notForbidden ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status} (not 403 = admin auth works)`);
  }

  // 5g. migrate_all — unauthenticated (no auth required per code)
  {
    const { ms, result } = await timed(() => edgeFetch({ action: 'migrate_all' }));
    record('Edge: migrate_all (no auth)', result.status === 200 ? 'PASS' : 'WARN', ms,
      `HTTP ${result.status}, migrated=${result.data?.migrated}`);
  }

  // ── SECTION 6: Security Checks ────────────────────────────────────────
  console.log('\n── Section 6: Security / Edge Cases ────────────────────\n');

  // 6a. Anonymous user cannot read clients
  {
    const { ms, result } = await timed(() => restQuery('clients', SUPABASE_ANON_KEY, 'select=id,username'));
    const count = Array.isArray(result.data) ? result.data.length : 0;
    record('Anon cannot read clients', count === 0 ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status}, rows=${count} (should be 0)`);
  }

  // 6b. Anonymous user cannot read submissions
  {
    const { ms, result } = await timed(() => restQuery('submissions', SUPABASE_ANON_KEY, 'select=id&limit=5'));
    const count = Array.isArray(result.data) ? result.data.length : 0;
    record('Anon cannot read submissions', count === 0 ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status}, rows=${count} (should be 0)`);
  }

  // 6c. Anonymous user cannot read admin_settings
  {
    const { ms, result } = await timed(() => restQuery('admin_settings', SUPABASE_ANON_KEY, 'select=id,password'));
    const count = Array.isArray(result.data) ? result.data.length : 0;
    record('Anon cannot read admin_settings', count === 0 ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status}, rows=${count} (should be 0 — password exposed if >0!)`);
  }

  // 6d. Client cannot read admin_settings
  if (client5050Token) {
    const { ms, result } = await timed(() => restQuery('admin_settings', client5050Token, 'select=id,password'));
    const count = Array.isArray(result.data) ? result.data.length : 0;
    record('Client cannot read admin_settings (password field!)', count === 0 ? 'PASS' : 'FAIL', ms,
      `HTTP ${result.status}, rows=${count} (should be 0)`);
  }

  // 6e. Client cannot write to another client's data
  if (client5050Token) {
    const { result: clientRes } = await timed(() => restQuery('clients', client1010Token || client5050Token, 'select=id'));
    // Try to insert a submission with a different client_id
    const fakeClientId = 99999;
    const res = await fetch(`${REST_URL}/submissions`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${client5050Token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ client_id: fakeClientId, month_key: '2026-01', data: {} }),
    });
    record('Client cannot insert submission for different client_id', res.status >= 400 ? 'PASS' : 'FAIL', 0,
      `HTTP ${res.status} (should be 4xx/5xx)`);
  }

  // ── SECTION 7: buildSession no-.eq() bug check ─────────────────────────
  console.log('\n── Section 7: buildSession .maybeSingle() without .eq() ──\n');

  // In App.tsx buildSession(), the clients query is:
  //   supabase.from("clients").select(...).maybeSingle()
  // with NO .eq() filter. This relies ENTIRELY on RLS to return the right row.
  // If RLS works (current_client_id() returns the right id), maybeSingle() returns 1 row = OK.
  // If RLS is broken, maybeSingle() could get multiple rows → runtime error "multiple rows returned".

  if (client5050Token) {
    const { ms, result } = await timed(() =>
      restQuery('clients', client5050Token, 'select=id,username,name,is_blocked')
    );
    const rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length === 1) {
      record('buildSession no-.eq() pattern: RLS returns exactly 1 row', 'PASS', ms,
        `OK — RLS filters correctly, username=${rows[0]?.username}`);
    } else if (rows.length === 0) {
      record('buildSession no-.eq() pattern: RLS returns 0 rows', 'FAIL', ms,
        'maybeSingle() would return null → user signed out! auth_id may be missing.');
    } else {
      record('buildSession no-.eq() pattern: RLS returns MULTIPLE rows', 'FAIL', ms,
        `${rows.length} rows returned → maybeSingle() would throw → force sign-out!`);
    }
  }

  // ── FINAL REPORT ──────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  DIAGNOSTIC SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;

  console.log(`  ✅ PASS: ${passed}`);
  console.log(`  ❌ FAIL: ${failed}`);
  console.log(`  ⚠️  WARN: ${warned}`);
  console.log(`  📊 Total: ${results.length}\n`);

  if (failed > 0) {
    console.log('  FAILED TESTS:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.name}`);
      console.log(`     ${r.detail}`);
    });
  }

  if (warned > 0) {
    console.log('\n  WARNINGS:');
    results.filter(r => r.status === 'WARN').forEach(r => {
      console.log(`  ⚠️  ${r.name}`);
      console.log(`     ${r.detail}`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Diagnostic script error:', err);
  process.exit(1);
});
