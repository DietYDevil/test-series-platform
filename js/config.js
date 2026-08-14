// ============================================================
// CONFIGURATION - fill in your Supabase project details.
//
// 1. Create a free project at https://supabase.com
// 2. Go to Project Settings -> API
// 3. Copy the "Project URL" and the "anon public" key below.
//
// The anon key is PUBLIC and safe to keep here because every
// table is protected by Row Level Security in sql/schema.sql.
// ============================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://dvmsqknpbrpcafokldmv.supabase.co",        // e.g. https://xyzcompany.supabase.co
  SUPABASE_ANON_KEY: "sb_publishable_KT_pllKykdqv5kAO8O-UFA_S8CiARSz", // e.g. eyJhbGciOi...
  APP_NAME: "testportal",       // shown at the top of the site
  APP_SUBTITLE: "Secure Online Test Portal",
  DEFAULT_COUNTRY_CODE: "+91",                    // change if not India
  MIN_PASSWORD: 6
};
