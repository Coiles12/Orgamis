# Orgamis

Application web mobile-first pour organiser des sorties entre amis:

- authentification Google ou email / mot de passe
- calendrier de disponibilites par semaine
- dashboard groupe avec heatmap
- proposition d'activites
- logistique transport et reservation de places en voiture

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase Auth + PostgreSQL + RLS

## Installation pas a pas

1. Se placer dans le dossier du projet:

```bash
cd "c:\Code\Sites\Orgamis 2\orgamis"
```

2. Installer les dependances:

```bash
npm install
```

3. Copier le fichier d'environnement:

```bash
copy .env.example .env.local
```

4. Creer un projet Supabase puis recuperer:

- l'URL du projet
- la cle anonyme publique

5. Completer `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

6. Dans Supabase, activer l'authentification:

- `Authentication > Providers > Google`
- configurer OAuth Google
- laisser `Email` actif pour email / mot de passe

7. Executer le schema SQL:

- ouvrir `SQL Editor` dans Supabase
- copier le contenu de `supabase/schema.sql`
- executer le script

8. Lancer le projet:

```bash
npm run dev
```

9. Ouvrir l'application:

- [http://localhost:3000](http://localhost:3000)

## Fichiers importants

- `docs/architecture.md` : architecture technique et regles metier
- `supabase/schema.sql` : tables, policies RLS, triggers et vue dashboard
- `src/lib/supabase/` : clients Supabase navigateur / serveur / proxy
- `src/types/database.ts` : types TypeScript des tables principales
- `src/app/page.tsx` : ecran de base en francais

## Commandes utiles

```bash
npm run dev
npm run lint
npm run build
```

## Implementation Status

L'application est entierement fonctionnelle:

- ✅ Page de connexion/inscription avec Google OAuth et email/mot de passe
- ✅ Dashboard avec calendrier interactif par semaine (dates reelles, pas generiques)
- ✅ Heatmap de groupe avec navigation semaine precedente/suivante
- ✅ Page activites avec creation de sorties
- ✅ Module de transport avec covoiturage et reservation de places
- ✅ Integration complete avec Supabase Auth et PostgreSQL
- ✅ RLS (Row Level Security) configure sur toutes les tables

## Fichiers importants

- `supabase/schema.sql` : schema complet avec tables, policies RLS, triggers et vue dashboard
- `src/lib/supabase/` : clients Supabase navigateur / serveur
- `src/types/database.ts` : types TypeScript des tables
- `src/app/page.tsx` : page de connexion
- `src/app/dashboard/page.tsx` : dashboard avec calendrier
- `src/app/activities/page.tsx` : gestion des activites et transport
