// Edge Function: manage-auth
// מנהל משתמשי Supabase Auth עבור האפליקציה
// פעולות: migrate_login, create, update_password, delete, migrate_all

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── Admin client (service role — bypasses RLS) ──────────────────
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ── Verify that the request comes from a logged-in admin ─────────
async function verifyAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  // is_admin is stored in app_metadata (only service role can set this — cannot be forged by clients)
  return user?.app_metadata?.is_admin === true;
}

// ── Create or update a Supabase Auth user ────────────────────────
async function upsertAuthUser(
  email: string,
  password: string,
  appMetadata: Record<string, unknown>,
  existingAuthId?: string | null,
) {
  if (existingAuthId) {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(existingAuthId, {
      password,
      app_metadata: appMetadata,
    });
    if (error) throw error;
    return data.user;
  }

  // Try to create a new user
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    app_metadata: appMetadata,
    email_confirm: true,
  });

  if (!error) return data.user;

  // If user already exists — find and update
  if (error.message.toLowerCase().includes("already")) {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u) => u.email === email);
    if (existing) {
      await supabaseAdmin.auth.admin.updateUserById(existing.id, { password, app_metadata: appMetadata });
      return existing;
    }
  }

  throw error;
}

// ── Delete all rows for a test client (by id) ───────────────────
async function cleanupTestClient(id: number) {
  const tables = [
    "scenario_items", "scenarios", "active_scenario",
    "imported_transactions", "import_batches",
    "month_entries", "submissions", "payslips",
    "remembered_mappings", "portfolio_months", "portfolio_submissions",
    "client_change_log", "client_documents", "manual_transactions",
    "client_questionnaire",
  ];
  for (const t of tables) {
    try { await supabaseAdmin.from(t).delete().eq("client_id", id); } catch { /* table may not exist */ }
  }
  await supabaseAdmin.from("clients").delete().eq("id", id);
}

// ════════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { action } = body;

    // ──────────────────────────────────────────────────────────────
    // migrate_login — no auth required.
    // Verifies legacy credentials (plaintext in DB via service role),
    // creates a Supabase Auth account if it doesn't exist, and returns
    // the user's profile so the frontend can call signInWithPassword.
    // ──────────────────────────────────────────────────────────────
    if (action === "migrate_login") {
      const { username, password } = body as { username: string; password: string };

      if (username === "admin") {
        const { data: settings, error } = await supabaseAdmin
          .from("admin_settings")
          .select("password")
          .eq("id", 1)
          .single();
        if (error || !settings) return json({ error: "שגיאת שרת" }, 500);
        if (settings.password !== password) return json({ error: "סיסמה שגויה" }, 401);

        await upsertAuthUser("admin@mazan.local", password, { is_admin: true });
        return json({ ok: true, role: "admin" });
      }

      // Client login
      const { data: client, error: clientErr } = await supabaseAdmin
        .from("clients")
        .select("id, username, name, password, auth_id")
        .eq("username", username)
        .maybeSingle();

      if (clientErr || !client) return json({ error: "משתמש לא נמצא" }, 401);
      if (client.password !== password) return json({ error: "סיסמה שגויה" }, 401);

      const authUser = await upsertAuthUser(
        `${username}@mazan.local`,
        password,
        { is_admin: false },
        client.auth_id,
      );

      // Link auth_id in clients table if not already set
      if (authUser && !client.auth_id) {
        await supabaseAdmin.from("clients").update({ auth_id: authUser.id }).eq("id", client.id);
      }

      return json({ ok: true, role: "client", username: client.username, name: client.name, id: client.id });
    }

    // ── migrate_all — no auth required (internal one-time migration) ──
    if (action === "migrate_all") {
      const { data: pending } = await supabaseAdmin
        .from("clients").select("id, username, password").is("auth_id", null);

      const results: Array<{ id: number; status: string; message?: string }> = [];
      for (const client of pending || []) {
        try {
          const authUser = await upsertAuthUser(
            `${client.username}@mazan.local`,
            client.password,
            { is_admin: false },
          );
          if (authUser) {
            await supabaseAdmin.from("clients").update({ auth_id: authUser.id }).eq("id", client.id);
            results.push({ id: client.id, status: "ok" });
          }
        } catch (e: any) {
          results.push({ id: client.id, status: "error", message: e.message });
        }
      }
      return json({ ok: true, migrated: results.length, results });
    }

    // ── seed — creates a test client row + auth user (no auth required, test-only) ──
    if (action === "seed") {
      const { name, username, password: pwd } = body as { name: string; username: string; password: string };
      const { data: existing } = await supabaseAdmin.from("clients").select("id").eq("username", username).maybeSingle();
      if (existing) return json({ ok: true, id: existing.id, existed: true });
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("clients")
        .insert([{ name, username, password: pwd }])
        .select("id")
        .single();
      if (insertErr) return json({ error: insertErr.message }, 500);
      const authUser = await upsertAuthUser(`${username}@mazan.local`, pwd, { is_admin: false }).catch(() => null);
      if (authUser) await supabaseAdmin.from("clients").update({ auth_id: authUser.id }).eq("id", inserted.id);
      return json({ ok: true, id: inserted.id });
    }

    // ── unseed — deletes a test client + auth user (no auth required, test-only) ──
    if (action === "unseed") {
      const { username } = body as { username: string };
      const { data: client } = await supabaseAdmin.from("clients").select("id, auth_id").eq("username", username).maybeSingle();
      if (!client) return json({ ok: true, existed: false });
      if (client.auth_id) await supabaseAdmin.auth.admin.deleteUser(client.auth_id).catch(() => {});
      await cleanupTestClient(client.id);
      return json({ ok: true });
    }

    // ──────────────────────────────────────────────────────────────
    // All other actions require admin authentication
    // ──────────────────────────────────────────────────────────────
    const isAdmin = await verifyAdmin(req);
    if (!isAdmin) return json({ error: "נדרשת הרשאת מנהל" }, 403);

    // ── create — creates a Supabase Auth user for a newly-inserted client ──
    if (action === "create") {
      const { username, password: pwd, clientId } = body as {
        username: string; password: string; clientId: number;
      };
      const authUser = await upsertAuthUser(
        `${username}@mazan.local`,
        pwd,
        { is_admin: false },
      );
      if (!authUser) return json({ error: "לא ניתן ליצור משתמש" }, 500);
      await supabaseAdmin.from("clients").update({ auth_id: authUser.id }).eq("id", clientId);
      return json({ ok: true, auth_id: authUser.id });
    }

    // ── update_password — syncs password change to Supabase Auth ──
    if (action === "update_password") {
      const { clientId, password: pwd } = body as { clientId: number; password: string };
      const { data: client } = await supabaseAdmin
        .from("clients").select("auth_id, username").eq("id", clientId).single();

      if (client?.auth_id) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(client.auth_id, { password: pwd });
        if (error) return json({ error: error.message }, 400);
      } else {
        // Client has no Supabase Auth account yet — create one with new password
        const authUser = await upsertAuthUser(
          `${client?.username}@mazan.local`,
          pwd,
          { is_admin: false },
        );
        if (authUser) {
          await supabaseAdmin.from("clients").update({ auth_id: authUser.id }).eq("id", clientId);
        }
      }
      return json({ ok: true });
    }

    // ── delete — removes the Supabase Auth user before deleting the client ──
    if (action === "delete") {
      const { clientId } = body as { clientId: number };
      const { data: client } = await supabaseAdmin
        .from("clients").select("auth_id").eq("id", clientId).single();
      if (client?.auth_id) {
        await supabaseAdmin.auth.admin.deleteUser(client.auth_id);
      }
      return json({ ok: true });
    }

    // ── send_reminder — sends an HTML reminder email via Gmail SMTP ──
    if (action === "send_reminder") {
      const { clientId } = body as { clientId: number };
      const { data: client } = await supabaseAdmin
        .from("clients")
        .select("name, last_name, email")
        .eq("id", clientId)
        .single();
      if (!client?.email) return json({ error: "אין מייל ללקוח" }, 400);

      const family = client.last_name ? `משפחת ${client.last_name}` : client.name;

      const htmlBody = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f3;font-family:'Segoe UI',Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f3;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#2d6a4f;padding:32px 40px;text-align:center;">
            <div style="color:#ffffff;font-size:22px;font-weight:700;">ממתינים לכם 📂</div>
            <div style="color:rgba(255,255,255,0.8);font-size:14px;margin-top:4px;">תזכורת ידידותית מאלון בן בסת</div>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="font-size:17px;color:#1a3328;font-weight:600;margin:0 0 16px;">היי ${family} 👋</p>
            <p style="font-size:15px;color:#4a5568;line-height:1.7;margin:0 0 16px;">רציתי לבדוק שהכל בסדר — שמתי לב שעוד לא הועלו המסמכים הנדרשים.</p>
            <p style="font-size:15px;color:#4a5568;line-height:1.7;margin:0 0 28px;">ברגע שנקבל את המסמכים נוכל להתקדם יחד לשלב הבא 🙂</p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
              <tr>
                <td style="background:#2d6a4f;border-radius:10px;padding:14px 32px;text-align:center;">
                  <a href="https://www.alonb.com" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">כניסה לאתר ←</a>
                </td>
              </tr>
            </table>
            <hr style="border:none;border-top:1px solid #e8ede8;margin:0 0 24px;">
            <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0;">
              לכל שאלה אני כאן,<br>
              <strong style="color:#1a3328;">אלון בן בסת</strong><br>
              מאמן ויועץ לכלכלת המשפחה<br>
              054-255-8557
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #e8ede8;">
            <p style="font-size:12px;color:#9ca3af;margin:0;">מאזן — ניהול פיננסי אישי חכם</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      try {
        const nodemailer = await import("npm:nodemailer@6");
        const transporter = nodemailer.default.createTransport({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          auth: {
            user: "alonb4040@gmail.com",
            pass: Deno.env.get("GMAIL_APP_PASSWORD")!,
          },
        });

        await transporter.sendMail({
          from: `"אלון בן בסת | מאזן" <alonb4040@gmail.com>`,
          to: client.email,
          subject: `תזכורת — ממתינים לך ${family} 📂`,
          html: htmlBody,
        });

        return json({ ok: true });
      } catch (e: any) {
        console.error("[send_reminder] SMTP error:", e.message);
        return json({ error: "שגיאה בשליחת המייל" }, 500);
      }
    }

    return json({ error: "פעולה לא ידועה" }, 400);
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
