// supabaseClient.js
const SUPABASE_URL = "https://cqnnxxcymelkwlcywokz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_eJ19otAOlp1ckDtDDct7JQ_HS-ySz5J";

window.sb = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log("✅ Supabase conectado a:", SUPABASE_URL);
