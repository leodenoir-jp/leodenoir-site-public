import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ImportMetaEnvWithSupabase = ImportMetaEnv & {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
};

const env = import.meta.env as ImportMetaEnvWithSupabase;
const supabaseUrl = (env.VITE_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY ?? "").trim();

let client: SupabaseClient | null = null;

function hasValidSupabaseUrl() {
  if (!supabaseUrl) return false;
  try {
    const parsed = new URL(supabaseUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function isSupabaseConfigured() {
  return Boolean(hasValidSupabaseUrl() && supabaseAnonKey);
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    try {
      client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce"
        }
      });
    } catch (error) {
      console.error("Supabase client initialization failed.", {
        message: error instanceof Error ? error.message : "Unknown error"
      });
      return null;
    }
  }
  return client;
}
