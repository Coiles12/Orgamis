import { Suspense } from "react";
import { redirect } from "next/navigation";

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
    redirect("/");
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
