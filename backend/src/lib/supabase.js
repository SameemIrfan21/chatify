import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env.js";

const supabaseUrl = ENV.SUPABASE_URL || "https://ppvgxisffxlmynyxqnec.supabase.co";

const apiKey =
  (ENV.SUPABASE_SERVICE_ROLE_KEY &&
    ENV.SUPABASE_SERVICE_ROLE_KEY !== "your-supabase-service-role-key")
    ? ENV.SUPABASE_SERVICE_ROLE_KEY
    : (ENV.SUPABASE_ANON_KEY ||
       ENV.SUPABASE_PUBLISHABLE_KEY ||
       "sb_publishable_bttlCVfYkg4YJkCNpxoQMA_wfqhSTat");

if (!supabaseUrl || !apiKey) {
  console.warn(
    "⚠️  SUPABASE_URL or Supabase API key is not set. Supabase auth will not work."
  );
}

// Supabase client for backend operations & token verification
const supabaseAdmin = createClient(
  supabaseUrl,
  apiKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export default supabaseAdmin;
