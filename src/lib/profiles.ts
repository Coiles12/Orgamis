import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export async function ensureUserProfile(
  supabase: Supabase,
  userId: string,
  displayName?: string | null,
) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        display_name: displayName?.trim() || "Membre",
      } as any,
      {
        onConflict: "id",
      },
    );

  return { error };
}
