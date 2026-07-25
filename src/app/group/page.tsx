import { Suspense } from "react";
import { redirect } from "next/navigation";

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
    redirect("/");
  }

  const userLabel = user.email || "Utilisateur";

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AppHeader currentPath="/group" userLabel={userLabel} />
      <Suspense fallback={<PageLoader label="Chargement de la vue groupe..." />}>
        <GroupClient userId={user.id} userLabel={userLabel} />
      </Suspense>
    </main>
  );
}
