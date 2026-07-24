-- Migration: passer d'un modele par jour de semaine generique a des dates reelles
-- Executer uniquement si une ancienne table utilisait weekday (lundi, mardi, etc.)
-- sans slot_date. Sinon, utiliser directement schema.sql.

-- Exemple d'ancienne structure a remplacer:
-- availability_slots(user_id, weekday integer, time_block, is_available)

-- 1. Sauvegarder les donnees existantes si besoin
-- create table public.availability_slots_backup as table public.availability_slots;

-- 2. Supprimer l'ancienne table si elle existe avec weekday
-- drop table if exists public.availability_slots cascade;

-- 3. Appliquer le schema complet depuis schema.sql
-- Le schema cible stocke chaque disponibilite avec:
--   slot_date (date reelle, ex: 2026-07-24)
--   iso_year / iso_week (colonnes generees automatiquement)
--   time_block (morning | noon | evening)

-- 4. Si vous migrez manuellement depuis weekday vers slot_date,
-- recalculez slot_date a partir de la semaine courante:
--
-- insert into public.availability_slots (user_id, slot_date, time_block, is_available)
-- select
--   user_id,
--   (date_trunc('week', current_date)::date + (weekday - 1)) as slot_date,
--   time_block,
--   is_available
-- from public.availability_slots_old;

-- 5. Verifier les index et contraintes
-- select slot_date, iso_year, iso_week, time_block, count(*)
-- from public.availability_slots
-- group by slot_date, iso_year, iso_week, time_block
-- order by slot_date, time_block;
