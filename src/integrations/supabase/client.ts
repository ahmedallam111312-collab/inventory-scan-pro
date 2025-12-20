import { createClient } from '@supabase/supabase-js';

// 1. Paste your Project URL here
const SUPABASE_URL = "https://rckeujbbmmqzyshqrcxa.supabase.co";

// 2. Paste the "Publishable API Key" here (Delete the old long string first!)
const SUPABASE_ANON_KEY = "sb_publishable_VS7jF5c-1EzFCMft35xH7A_VgoUs1J0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});