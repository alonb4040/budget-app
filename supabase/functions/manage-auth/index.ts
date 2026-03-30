// Edge Function: manage-auth
// מנהל משתמשי Supabase Auth עבור האפליקציה
// פעולות: migrate_login, create, update_password, delete, migrate_all

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // ── migrate_all — migrates all clients that don't have auth_id yet ──
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

    return json({ error: "פעולה לא ידועה" }, 400);
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
