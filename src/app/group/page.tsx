import { Suspense } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { GroupClient } from "@/components/group/group-client";
import { PageLoader } from "@/components/ui/page-loader";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const revalidate = 0;

export default async function GroupPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Non authentifié</p>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const userLabel = profile?.display_name || user.email || "Utilisateur";

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AppHeader currentPath="/group" userLabel={userLabel} />
      <Suspense fallback={<PageLoader label="Chargement de la vue groupe..." />}>
        <GroupClient userId={user.id} userLabel={userLabel} />
      </Suspense>
    </main>
  );
}
