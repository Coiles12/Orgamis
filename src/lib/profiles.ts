import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export async function ensureUserProfile(
  supabase: Supabase,
  userId: string,
  displayName?: string | null,
) {
  // First check if profile exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single() as any;

  // Only set display_name if profile doesn't exist or has no display_name
  const finalDisplayName = existingProfile?.display_name 
    ? existingProfile.display_name 
    : (displayName?.trim() || "Membre");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        display_name: finalDisplayName,
      } as any,
      {
        onConflict: "id",
      },
    );

  return { error };
}
