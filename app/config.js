/* ══════════════════════════════════════════════════════════════════════════
   Wings Ahead — configuration. THE ONLY FILE YOU EDIT.
   ──────────────────────────────────────────────────────────────────────────
   Two paste operations (both values are on supabase.com →  your project →
   Settings → API):

     1. SUPABASE_URL      → "Project URL"        (e.g. https://abcd1234.supabase.co)
     2. SUPABASE_ANON_KEY → "anon public" key    (long string starting eyJ… or sb_publishable_…)

   The anon key is SAFE to publish — the database only answers through
   token-checked functions (see db/schema.sql). Personal tokens are NOT here.

   LAUNCH (2026-08-19): the app decides by WHERE IT IS SERVED FROM —
   · localhost  → the local development stack (supabase start), so demos and
                  agent rounds keep working untouched;
   · anywhere else (GitHub Pages) → the squadron's cloud project (Frankfurt).
   ══════════════════════════════════════════════════════════════════════════ */
var WA_CONFIG = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  ? {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_ANON_KEY: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
  }
  : {
    SUPABASE_URL: "https://cublgiougtbiyaqputfd.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_JsX4xj5VPI465evE8uXaPA_ImwXA915",
  };
