"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  TIME_BLOCKS,
  type TimeBlock,
} from "@/lib/constants";
import {
  getWeekDays,
  parseWeekStart,
  shiftWeek,
  toDateInputValue,
} from "@/lib/date";
import { ensureUserProfile } from "@/lib/profiles";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AvailabilityRow } from "@/types/app";

type GroupClientProps = {
  userId: string;
  userLabel: string;
};

function buildAvailabilityKey(date: string, timeBlock: TimeBlock) {
  return `${date}__${timeBlock}`;
}

function getHeatClasses(count: number, memberCount: number) {
  if (memberCount === 0 || count === 0) {
    return "bg-zinc-100 text-zinc-500";
  }

  const ratio = count / memberCount;

  if (ratio >= 0.75) {
    return "bg-emerald-600 text-white";
  }

  if (ratio >= 0.5) {
    return "bg-emerald-200 text-emerald-950";
  }

  if (ratio >= 0.25) {
    return "bg-amber-100 text-amber-950";
  }

  return "bg-zinc-200 text-zinc-700";
}

export function GroupClient({ userId, userLabel }: GroupClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  const [memberCount, setMemberCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; timeBlock: TimeBlock } | null>(null);
  const [slotDetails, setSlotDetails] = useState<Array<{ user_id: string; display_name: string | null; status: "available" | "unsure" | "unavailable" }>>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activities, setActivities] = useState<Array<{ id: string; title: string; date: string; time_block: TimeBlock | null; location: string | null }>>([]);

  const weekParam = searchParams.get("week");
  const weekStart = useMemo(() => parseWeekStart(weekParam), [weekParam]);
  const weekStartValue = useMemo(() => toDateInputValue(weekStart), [weekStart]);
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekEndValue = weekDays[6]?.date ?? weekStartValue;

  const loadWeek = useCallback(
    async (from: string, to: string) => {
      setIsLoading(true);
      setError(null);

      await ensureUserProfile(supabase, userId, userLabel);

      const [profilesResult, availabilityResult, activitiesResult] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase
          .from("availability_slots")
          .select("id, user_id, slot_date, time_block, status")
          .gte("slot_date", from)
          .lte("slot_date", to),
        supabase
          .from("activities")
          .select("id, title, date, time_block, location")
          .gte("date", from)
          .lte("date", to)
          .eq("status", "confirmed"),
      ]);

      if (profilesResult.error || availabilityResult.error || activitiesResult.error) {
        setIsLoading(false);
        setError("Impossible de charger les disponibilites de la semaine.");
        return;
      }

      const availabilityRows = (availabilityResult.data ?? []) as AvailabilityRow[];
      const nextGroupCounts: Record<string, number> = {};

      availabilityRows.forEach((row) => {
        const key = buildAvailabilityKey(row.slot_date, row.time_block);
        const weight = row.status === "available" ? 1 : row.status === "unsure" ? 0.5 : 0;
        nextGroupCounts[key] = (nextGroupCounts[key] ?? 0) + weight;
      });

      setGroupCounts(nextGroupCounts);
      setMemberCount(profilesResult.count ?? 0);
      setActivities(activitiesResult.data ?? []);
      setIsLoading(false);
    },
    [supabase, userId, userLabel],
  );

  const loadSlotDetails = useCallback(async (date: string, timeBlock: TimeBlock) => {
    setLoadingDetails(true);
    setSelectedSlot({ date, timeBlock });

    const [profilesResult, availabilityResult] = await Promise.all([
      supabase.from("profiles").select("id, display_name"),
      supabase
        .from("availability_slots")
        .select("user_id, status")
        .eq("slot_date", date)
        .eq("time_block", timeBlock),
    ]);

    if (profilesResult.error || availabilityResult.error) {
      setLoadingDetails(false);
      return;
    }

    const profiles = profilesResult.data ?? [];
    const availabilities = availabilityResult.data ?? [];

    const details = profiles.map((profile) => {
      const availability = availabilities.find((a) => a.user_id === profile.id);
      return {
        user_id: profile.id,
        display_name: profile.display_name,
        status: availability?.status ?? "unavailable",
      };
    });

    setSlotDetails(details);
    setLoadingDetails(false);
  }, [supabase]);

  const getActivitiesForSlot = useCallback((date: string, timeBlock: TimeBlock) => {
    return activities.filter(
      (activity) => {
        const activityDate = new Date(activity.date).toISOString().split('T')[0];
        return activityDate === date && activity.time_block === timeBlock;
      }
    );
  }, [activities]);

  const navigateWeek = useCallback(
    (direction: number) => {
      const newWeekStart = shiftWeek(weekStart, direction);
      const newWeekParam = toDateInputValue(newWeekStart);
      const params = new URLSearchParams(searchParams.toString());
      params.set("week", newWeekParam);
      router.push(`/group?${params.toString()}`);
    },
    [weekStart, searchParams, router],
  );

  useEffect(() => {
    void loadWeek(weekStartValue, weekEndValue);
  }, [weekStartValue, weekEndValue, loadWeek]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-lg shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-zinc-950/50 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Heatmap du groupe
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Vue globale de la semaine
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {memberCount > 0
                ? `${memberCount} membre(s) dans le groupe.`
                : "Aucun membre detecte pour le moment."}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              Les cellules vertes representent les meilleurs creneaux
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigateWeek(-1)}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                <ChevronLeft className="size-4" />
                Semaine précédente
              </button>
              <button
                type="button"
                onClick={() => navigateWeek(1)}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Semaine suivante
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {error}
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
          <div className="grid grid-cols-[80px_repeat(3,minmax(0,1fr))] border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
            <div className="px-4 py-4">Jour</div>
            {TIME_BLOCKS.map((block) => (
              <div key={block.value} className="px-4 py-4 text-center">
                {block.label}
              </div>
            ))}
          </div>

          {weekDays.map((day) => (
            <div
              key={day.date}
              className="grid grid-cols-[80px_repeat(3,minmax(0,1fr))] border-b border-zinc-200 last:border-b-0"
            >
              <div className="flex items-center justify-center border-r border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
                <div className="text-center">
                  <p>{day.dayLabel}</p>
                  <p className="mt-1 text-sm font-semibold tracking-normal text-zinc-900 dark:text-zinc-100">
                    {day.dayNumber}
                  </p>
                </div>
              </div>

              {TIME_BLOCKS.map((block) => {
                const key = buildAvailabilityKey(day.date, block.value);
                const count = groupCounts[key] ?? 0;
                const ratio = memberCount > 0 ? count / memberCount : 0;
                const isBestSlot = ratio >= 0.75;
                const slotActivities = getActivitiesForSlot(day.date, block.value);

                return (
                  <div key={key} className="border-r border-zinc-100 p-2 last:border-r-0 dark:border-zinc-700">
                    <button
                      type="button"
                      onClick={() => loadSlotDetails(day.date, block.value)}
                      className={`flex h-14 w-full items-center justify-center rounded-md text-sm font-semibold relative transition hover:ring-2 hover:ring-emerald-500 ${getHeatClasses(
                        count,
                        memberCount,
                      )}`}
                    >
                      {count}
                      {isBestSlot && count > 0 && (
                        <span className="absolute -top-1 -right-1 flex size-3 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">
                          ⭐
                        </span>
                      )}
                    </button>
                    {slotActivities.length > 0 && (
                      <div className="mt-1 space-y-1">
                        {slotActivities.map((activity) => (
                          <div
                            key={activity.id}
                            className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-900 dark:bg-blue-900 dark:text-blue-100"
                            title={activity.location || undefined}
                          >
                            {activity.title}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {selectedSlot && (
          <div className="mt-6 rounded-md border border-zinc-200 bg-white p-5 shadow-lg shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-zinc-950/50 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  Détails du créneau
                </h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {selectedSlot.date} - {TIME_BLOCKS.find((b) => b.value === selectedSlot.timeBlock)?.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSlot(null)}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Fermer
              </button>
            </div>

            {loadingDetails ? (
              <div className="mt-4 text-sm text-zinc-500">Chargement...</div>
            ) : (
              <div className="mt-4 space-y-2">
                {slotDetails.map((detail) => (
                  <div
                    key={detail.user_id}
                    className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                      {detail.display_name || "Sans pseudo"}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        detail.status === "available"
                          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"
                          : detail.status === "unsure"
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
                            : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {detail.status === "available"
                        ? "Disponible"
                        : detail.status === "unsure"
                          ? "Pas sûr"
                          : "Indisponible"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isLoading && (
          <div className="mt-4 text-sm text-zinc-500">
            Chargement des disponibilites...
          </div>
        )}
      </section>
    </div>
  );
}
