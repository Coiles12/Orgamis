"use client";

import { Moon, Sun, Monitor, LoaderCircle, Trash2 } from "lucide-react";
import { FormEvent, useState, useEffect } from "react";

import { useTheme } from "@/lib/theme";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SettingsClientProps = {
  userId: string;
  isAdmin?: boolean;
};

export function SettingsClient({ userId, isAdmin: initialIsAdmin }: SettingsClientProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [profiles, setProfiles] = useState<Array<{ id: string; display_name: string | null }>>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deleteAccountMessage, setDeleteAccountMessage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(initialIsAdmin ?? false);

  useEffect(() => {
    if (initialIsAdmin === undefined) {
      supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", userId)
        .single()
        .then(({ data }) => {
          setIsAdmin(data?.is_admin ?? false);
        });
    }
  }, [initialIsAdmin, userId, supabase]);

  const loadProfiles = async () => {
    setIsLoadingProfiles(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name")
      .order("display_name");
    setProfiles(data ?? []);
    setIsLoadingProfiles(false);
  };

  const handleUpdateDisplayName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingProfileId) return;

    setIsSaving(true);
    setProfileMessage(null);

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: newDisplayName.trim() || null })
      .eq("id", editingProfileId);

    setIsSaving(false);

    if (error) {
      setProfileMessage(error.message);
      return;
    }

    setEditingProfileId(null);
    setNewDisplayName("");
    setProfileMessage("Pseudo mis à jour avec succès.");
    await loadProfiles();
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    setDeleteAccountMessage(null);

    // Delete user's profile
    const { error: profileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileError) {
      setIsDeletingAccount(false);
      setDeleteAccountMessage(profileError.message);
      return;
    }

    // Call server endpoint to delete auth account
    const response = await fetch("/api/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      setIsDeletingAccount(false);
      setDeleteAccountMessage("Erreur lors de la suppression du compte.");
      return;
    }

    // Sign out and redirect
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const handleDeleteUserAccount = async (targetUserId: string) => {
    setDeletingUserId(targetUserId);
    setProfileMessage(null);

    // Delete user's profile
    const { error: profileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", targetUserId);

    if (profileError) {
      setDeletingUserId(null);
      setProfileMessage(profileError.message);
      return;
    }

    // Call server endpoint to delete auth account
    const response = await fetch("/api/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetUserId }),
    });

    if (!response.ok) {
      setDeletingUserId(null);
      setProfileMessage("Erreur lors de la suppression du compte.");
      return;
    }

    setDeletingUserId(null);
    setProfileMessage("Compte supprimé avec succès.");
    await loadProfiles();
  };

  if (isAdmin && profiles.length === 0 && !isLoadingProfiles) {
    void loadProfiles();
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-lg shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-zinc-950/50 sm:p-6">
        <div>
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            Paramètres
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Apparence
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Choisissez votre thème préféré
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`flex flex-col items-center gap-3 rounded-2xl border p-4 transition ${
              theme === "light"
                ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950"
                : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            }`}
          >
            <Sun className="size-6 text-zinc-700 dark:text-zinc-300" />
            <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Clair
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`flex flex-col items-center gap-3 rounded-2xl border p-4 transition ${
              theme === "dark"
                ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950"
                : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            }`}
          >
            <Moon className="size-6 text-zinc-700 dark:text-zinc-300" />
            <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Sombre
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTheme("system")}
            className={`flex flex-col items-center gap-3 rounded-2xl border p-4 transition ${
              theme === "system"
                ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950"
                : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            }`}
          >
            <Monitor className="size-6 text-zinc-700 dark:text-zinc-300" />
            <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Système
            </span>
          </button>
        </div>

        <div className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Thème actuel :{" "}
          <span className="font-semibold text-zinc-950 dark:text-zinc-50">
            {resolvedTheme === "light" ? "Clair" : "Sombre"}
          </span>
        </div>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-lg shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-zinc-950/50 sm:p-6">
        <div>
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            Zone de danger
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Supprimer mon compte
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Cette action est irréversible. Toutes vos données seront supprimées.
          </p>
        </div>

        {deleteAccountMessage && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {deleteAccountMessage}
          </div>
        )}

        <div className="mt-6">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingAccount ? (
                  <span className="flex items-center gap-2">
                    <LoaderCircle className="size-4 animate-spin" />
                    Suppression...
                  </span>
                ) : (
                  "Confirmer la suppression"
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeletingAccount}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
            >
              <Trash2 className="size-4" />
              Supprimer mon compte
            </button>
          )}
        </div>
      </section>

      {isAdmin && (
        <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-lg shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-zinc-950/50 sm:p-6">
          <div>
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Administration
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Gestion des profils
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Modifier les pseudos des utilisateurs
            </p>
          </div>

          {profileMessage && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {profileMessage}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {isLoadingProfiles ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                <LoaderCircle className="size-4 animate-spin" />
                Chargement des profils...
              </div>
            ) : (
              profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800"
                >
                  {editingProfileId === profile.id ? (
                    <form onSubmit={handleUpdateDisplayName} className="flex w-full flex-col gap-3">
                      <input
                        type="text"
                        value={newDisplayName}
                        onChange={(e) => setNewDisplayName(e.target.value)}
                        placeholder="Nouveau pseudo"
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-950"
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={isSaving}
                          className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSaving ? "Enregistrement..." : "Sauvegarder"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProfileId(null);
                            setNewDisplayName("");
                          }}
                          className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Annuler
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                        {profile.display_name || "Sans pseudo"}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProfileId(profile.id);
                            setNewDisplayName(profile.display_name || "");
                          }}
                          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Modifier
                        </button>
                        {profile.id !== userId && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUserAccount(profile.id)}
                            disabled={deletingUserId === profile.id}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingUserId === profile.id ? (
                              <span className="flex items-center gap-2">
                                <LoaderCircle className="size-4 animate-spin" />
                                Suppression...
                              </span>
                            ) : (
                              <span className="flex items-center gap-2">
                                <Trash2 className="size-4" />
                                Supprimer
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
