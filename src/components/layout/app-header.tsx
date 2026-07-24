import Link from "next/link";

import { SignOutButton } from "@/components/layout/sign-out-button";

type AppHeaderProps = {
  currentPath: "/dashboard" | "/activities" | "/settings" | "/group";
  userLabel: string;
};

const navigation = [
  { href: "/dashboard", label: "Disponibilités" },
  { href: "/group", label: "Vue groupe" },
  { href: "/activities", label: "Activités" },
  { href: "/settings", label: "Paramètres" },
] as const;

export function AppHeader({ currentPath, userLabel }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <Link href="/dashboard" className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            Orgamis
          </Link>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{userLabel}</p>
        </div>

        <nav className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 rounded-md bg-zinc-100 p-1 dark:bg-zinc-800">
            {navigation.map((item) => {
              const isActive = item.href === currentPath;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <SignOutButton />
        </nav>
      </div>
    </header>
  );
}
