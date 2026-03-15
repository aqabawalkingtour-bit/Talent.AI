import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Use a lazy singleton so the app does not crash at module load time
// when Supabase credentials are absent (e.g. on GitHub Pages without secrets).
let _supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase URL or Key is missing. Database features will not work.');
    return null;
  }
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseKey);
  }
  return _supabase;
}

// Keep the named export for backward compatibility.
// Consumers that call supabase?.from(...) will gracefully receive null.
export const supabase = (() => {
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }
  try {
    return createClient(supabaseUrl, supabaseKey);
  } catch (e) {
    console.warn('Failed to initialise Supabase client:', e);
    return null;
  }
})();

export { getSupabaseClient };
