import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Service-role Supabase client, used only for Storage (product photo uploads).
 * Bypasses RLS — server only. Login and accounts are handled by the app itself
 * (lib/session.ts, lib/users.ts), not by Supabase Auth.
 */
export function createSupabaseAdminClient() {
  return createClient(serverEnv.supabaseUrl(), serverEnv.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
