import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Cliente publico (anon key) — seguro para uso no browser. Sujeito a RLS,
// que hoje esta configurado como deny-all (ver supabase-schema.sql).
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente administrativo (service_role key) — bypassa RLS. Uso exclusivo
// em codigo server-side (Route Handlers, Server Components, scripts de
// migracao). Nunca importar este modulo em Client Components.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
