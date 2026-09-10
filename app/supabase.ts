import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://nfrfrzfpdghigwdkpcqc.supabase.co";
const supabasePublishableKey = "sb_publishable_ck2T-LwvlaKkC3W1yhPYYA_rVWzzT7z";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
