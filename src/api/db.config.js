/**
 * Database Backend Configuration
 *
 * Controls which data backend the system uses.
 * Change BACKEND to switch between:
 *   - 'supabase'   : PostgreSQL via Supabase (cloud, multi-user shared data)
 *   - 'indexeddb'  : IndexedDB via Dexie (local browser, single-user)
 *   - 'local'      : Local Node.js API server (future, self-hosted)
 *
 * Supabase credentials are read from environment variables (Vite prefix VITE_).
 * Create a .env file in the project root:
 *   VITE_SUPABASE_URL=https://your-project.supabase.co
 *   VITE_SUPABASE_ANON_KEY=your-anon-key
 */

export const BACKEND = import.meta.env.VITE_DB_BACKEND || 'supabase'

export const LOCAL_SAT_BACKEND_URL = import.meta.env.VITE_LOCAL_SAT_BACKEND_URL || 'http://127.0.0.1:5080'

export const SUPABASE_CONFIG = {
  url: import.meta.env.VITE_SUPABASE_URL || '',
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || ''
}

// Check if Supabase is properly configured
export function isSupabaseConfigured() {
  return SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey
}
