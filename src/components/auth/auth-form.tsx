"use client";

import { Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { ensureUserProfile } from "@/lib/profiles";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const initialError = useMemo(() => {
    const reason = searchParams.get("error");

    if (reason === "oauth_callback") {
      return "La connexion Google a échoué. Veuillez réessayer.";
    }

    return null;
  }, [searchParams]);

  const finishAuth = async (userId: string, displayName?: string | null) => {
    await ensureUserProfile(supabase, userId, displayName);
    router.replace("/dashboard");
    router.refresh();
  };

  const handleEmailAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    if (mode === "login") {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setIsSubmitting(false);
        setMessage(error.message);
        return;
      }

      if (data.user) {
        await finishAuth(data.user.id, data.user.email);
      }

      setIsSubmitting(false);
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setIsSubmitting(false);
      setMessage(error.message);
      return;
    }

    if (data.session?.user) {
      await finishAuth(data.session.user.id, data.session.user.email);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setMessage(
      "Compte créé. Vérifiez votre boîte email pour confirmer l'inscription.",
    );
  };

  const handleGoogleAuth = async () => {
    setIsSubmitting(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setIsSubmitting(false);
      setMessage(error.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10 sm:px-6">
      <div className="w-full max-w-md rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-950/5 sm:p-8">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600">
            Orgamis
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950">
            {mode === "login" ? "Connexion" : "Créer un compte"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500">
            {mode === "login"
              ? "Connectez-vous pour gérer vos disponibilités et activités."
              : "Inscrivez-vous pour rejoindre votre groupe d'amis."}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 rounded-full bg-zinc-100 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === "login"
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-500"
            }`}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === "signup"
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-500"
            }`}
          >
            Inscription
          </button>
        </div>

        <button
          type="button"
          onClick={handleGoogleAuth}
          disabled={isSubmitting}
          className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg className="size-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continuer avec Google
        </button>

        <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-zinc-400">
          <span className="h-px flex-1 bg-zinc-200" />
          ou par email
          <span className="h-px flex-1 bg-zinc-200" />
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleEmailAuth}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-700">
              Adresse email
            </span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pr-4 pl-11 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                placeholder="vous@exemple.com"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-700">
              Mot de passe
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              placeholder="Minimum 6 caractères"
            />
          </label>

          {(initialError || message) && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {message ?? initialError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? "Chargement..."
              : mode === "login"
                ? "Se connecter"
                : "Créer mon compte"}
          </button>
        </form>
      </div>
    </div>
  );
}
