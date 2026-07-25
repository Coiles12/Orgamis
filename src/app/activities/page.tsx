import { Suspense } from "react";

import { ActivitiesClient } from "@/components/activities/activities-client";
import { AppHeader } from "@/components/layout/app-header";
import { PageLoader } from "@/components/ui/page-loader";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const revalidate = 0;

export default async function ActivitiesPage() {
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

  const userLabel = user.email || "Utilisateur";

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AppHeader currentPath="/activities" userLabel={userLabel} />
      <Suspense fallback={<PageLoader label="Chargement des activités..." />}>
        <ActivitiesClient userId={user.id} userLabel={userLabel} />
      </Suspense>
    </main>
  );
}
