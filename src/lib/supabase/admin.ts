import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

export function createAdminClient() {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL as string,
    env.SUPABASE_SERVICE_ROLE_KEY as string,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}