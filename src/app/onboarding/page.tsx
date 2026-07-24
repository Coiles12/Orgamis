import { OnboardingClient } from "@/components/onboarding/onboarding-client";
import { requireUser } from "@/lib/auth";

export default async function OnboardingPage() {
  const user = await requireUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10 sm:px-6 dark:bg-zinc-950">
      <OnboardingClient userId={user.id} userEmail={user.email} />
    </main>
  );
}
