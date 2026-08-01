import { createClient } from '@supabase/supabase-js'

// Server-only client — uses the service_role key
// WARNING: NEVER import this file in any component or client-side code!
// This key bypasses all Row Level Security rules — full admin access.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key'
)