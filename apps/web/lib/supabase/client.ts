import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a browser-side Supabase client singleton for Client Components.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local"
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
