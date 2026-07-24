-- Migration pour ajouter l'état "pas sûr" aux disponibilités
-- Exécuter ce script dans l'éditeur SQL Supabase

-- Ajouter le nouveau type availability_status s'il n'existe pas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'availability_status') THEN
        CREATE TYPE public.availability_status AS enum ('available', 'unavailable', 'unsure');
    END IF;
END $$;

-- Ajouter la colonne status temporairement
ALTER TABLE public.availability_slots ADD COLUMN IF NOT EXISTS status public.availability_status;

-- Migrer les données existantes : is_available=true -> available, is_available=false -> unavailable
UPDATE public.availability_slots 
SET status = CASE WHEN is_available = true THEN 'available' ELSE 'unavailable' END::public.availability_status
WHERE status IS NULL;

-- Rendre la colonne NOT NULL
ALTER TABLE public.availability_slots ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.availability_slots ALTER COLUMN status SET DEFAULT 'available';

-- Supprimer la vue qui dépend de l'ancienne colonne
DROP VIEW IF EXISTS public.availability_dashboard;

-- Supprimer l'ancienne colonne is_available
ALTER TABLE public.availability_slots DROP COLUMN IF EXISTS is_available;

-- Recréer la vue availability_dashboard pour utiliser les 3 états
CREATE OR REPLACE VIEW public.availability_dashboard AS
SELECT
  extract(isoyear from slot_date)::integer AS iso_year,
  extract(week from slot_date)::integer AS iso_week,
  slot_date,
  time_block,
  count(*) FILTER (WHERE status = 'available') AS available_count,
  count(*) FILTER (WHERE status = 'unsure') AS unsure_count,
  (count(*) FILTER (WHERE status = 'available') + count(*) FILTER (WHERE status = 'unsure') * 0.5)::numeric AS weighted_count
FROM public.availability_slots
GROUP BY slot_date, time_block
ORDER BY slot_date, time_block;

-- Ajouter time_block à la table activities
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS time_block public.time_block;
