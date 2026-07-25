import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { PageLoader } from "@/components/ui/page-loader";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const revalidate = 0;

export default async function DashboardPage() {
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
      <AppHeader currentPath="/dashboard" userLabel={userLabel} />
      <Suspense fallback={<PageLoader label="Chargement du calendrier..." />}>
        <DashboardClient userId={user.id} userLabel={userLabel} />
      </Suspense>
    </main>
  );
}
