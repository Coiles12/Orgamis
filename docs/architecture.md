# Architecture Orgamis

## Stack retenue

- Frontend: Next.js 16, React 19, TypeScript, App Router
- UI: Tailwind CSS 4, design mobile-first, composants serveur par defaut
- Backend: Supabase (PostgreSQL, Auth, Row Level Security)
- Authentification: Google OAuth + email/mot de passe via Supabase Auth
- Deploiement conseille: Vercel pour le frontend, Supabase Cloud pour la base

## Pourquoi ce choix

- Next.js est rapide a generer et facile a faire evoluer via IA
- Supabase couvre auth, base, policies et SQL sans backend custom lourd
- Le modele relationnel PostgreSQL est ideal pour les creneaux, reservations et agregations
- Le rendu App Router facilite le mix entre server components, server actions et pages responsives

## Organisation du projet

```text
orgamis/
  docs/
    architecture.md
  src/
    app/
      layout.tsx
      page.tsx
    lib/
      constants.ts
      env.ts
      utils.ts
      supabase/
        client.ts
        proxy.ts
        server.ts
    types/
      database.ts
  supabase/
    schema.sql
  proxy.ts
  .env.example
```

## Decoupage fonctionnel conseille

### 1. Authentification

- `/connexion` : page login / inscription
- `/auth/callback` : retour Google OAuth
- `profiles` : profil public minimal synchronise avec `auth.users`

### 2. Disponibilites

- `/disponibilites` : saisie individuelle semaine par semaine
- `/tableau-de-bord` : vision groupe avec heatmap
- `availability_slots` : un enregistrement par date, creneau et utilisateur

### 3. Activites

- `/activites` : liste des sorties
- `/activites/[id]` : detail d'une sortie, participants, transport, reservations
- `activities` : evenement planifie
- `activity_participants` : presence + mode de transport de chaque utilisateur
- `carpools` : voitures proposees par les conducteurs
- `car_seat_reservations` : reservation des places restantes

## Regles metier principales

- Un utilisateur peut definir sa disponibilite pour chaque date et bloc `morning | noon | evening`
- Le tableau de bord calcule le nombre total de membres disponibles par creneau
- Une activite peut etre creee par tout membre authentifie
- Un participant peut declarer son mode de transport pour une activite
- Un conducteur peut proposer une voiture avec un nombre de places limite
- Un passager ne peut reserver qu'une seule place dans une meme voiture
- Les policies RLS doivent empecher un utilisateur de modifier les donnees d'un autre membre

## Strategie UI

- Mobile-first avec cartes empilees, zones tactiles larges et navigation simple
- Breakpoints desktop pour afficher tableaux, heatmaps et colonnes cote a cote
- Texte visible 100 % en francais
- Couleurs fortes pour reperer les meilleurs creneaux disponibles

## Etapes de build recommandees

1. Initialiser auth et profils
2. Ajouter l'ecran de disponibilites individuelles
3. Ajouter le dashboard groupe avec agrégations SQL
4. Ajouter creation d'activites
5. Ajouter covoiturage et reservations de places
6. Finaliser permissions, tests et deploiement
