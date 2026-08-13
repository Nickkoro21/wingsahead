/* ══════════════════════════════════════════════════════════════════════════
   WingsAhead — configuration. THE ONLY FILE YOU EDIT.
   ──────────────────────────────────────────────────────────────────────────
   Two paste operations (both values are on supabase.com →  your project →
   Settings → API):

     1. SUPABASE_URL      → "Project URL"        (e.g. https://abcd1234.supabase.co)
     2. SUPABASE_ANON_KEY → "anon public" key    (long string starting eyJ… or sb_publishable_…)

   The anon key is SAFE to publish — the database only answers through
   token-checked functions (see db/schema.sql). Personal tokens are NOT here.
   ══════════════════════════════════════════════════════════════════════════ */
var WA_CONFIG = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
};
