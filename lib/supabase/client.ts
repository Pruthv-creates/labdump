import { createClient } from '@supabase/supabase-js'

// Browser-safe client — uses the anon key only
// Safe to use in React components and client-side code
// Limited by your Supabase Row Level Security (RLS) rules
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
)