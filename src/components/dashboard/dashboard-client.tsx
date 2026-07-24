"use client";

import { ChevronLeft, ChevronRight, LoaderCircle, Check, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  TIME_BLOCKS,
  TIME_BLOCK_LABELS,
  type TimeBlock,
} from "@/lib/constants";
import {
  getWeekDays,
  getWeekMeta,
  parseWeekStart,
  shiftWeek,
  toDateInputValue,
} from "@/lib/date";
import { ensureUserProfile } from "@/lib/profiles";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type DashboardClientProps = {
  userId: string;
  userLabel: string;
};

function buildAvailabilityKey(date: string, timeBlock: TimeBlock) {
  return `${date}__${timeBlock}`;
}

export function DashboardClient({ userId, userLabel }: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [selectedKeys, setSelectedKeys] = useState<Record<string, "available" | "unsure" | "unavailable">>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const weekParam = searchParams.get("week");
  const weekStart = useMemo(() => parseWeekStart(weekParam), [weekParam]);
  const weekStartValue = useMemo(() => toDateInputValue(weekStart), [weekStart]);
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekEndValue = weekDays[6]?.date ?? weekStartValue;
  const weekMeta = useMemo(() => getWeekMeta(weekStart), [weekStart]);

  const loadWeek = useCallback(
    async (from: string, to: string) => {
      setIsLoading(true);
      setError(null);

      await ensureUserProfile(supabase, userId, userLabel);

      const { data: availabilityResult, error: availabilityError } = await supabase
        .from("availability_slots")
        .select("id, user_id, slot_date, time_block, status")
        .gte("slot_date", from)
        .lte("slot_date", to)
        .eq("user_id", userId);

      if (availabilityError) {
        setIsLoading(false);
        setError("Impossible de charger les disponibilites de la semaine.");
        return;
      }

      const nextSelectedKeys: Record<string, "available" | "unsure" | "unavailable"> = {};
      availabilityResult?.forEach((row) => {
        const key = buildAvailabilityKey(row.slot_date, row.time_block);
        nextSelectedKeys[key] = row.status;
      });

      setSelectedKeys(nextSelectedKeys);
      setIsLoading(false);
    },
    [supabase, userId, userLabel],
  );

  useEffect(() => {
    void loadWeek(weekStartValue, weekEndValue);
  }, [weekEndValue, weekStartValue, loadWeek]);

  const navigateWeek = (offset: number) => {
    const nextWeekStart = toDateInputValue(shiftWeek(weekStart, offset));
    router.push(`/dashboard?week=${nextWeekStart}`);
  };

  const toggleAvailability = async (date: string, timeBlock: TimeBlock) => {
    const key = buildAvailabilityKey(date, timeBlock);
    const currentStatus = selectedKeys[key];
    
    // Cycle through: unavailable -> available -> unsure -> unavailable
    const nextStatus: "available" | "unsure" | "unavailable" = 
      currentStatus === "unavailable" ? "available" :
      currentStatus === "available" ? "unsure" : "unavailable";

    setSavingKey(key);
    setError(null);

    if (nextStatus === "unavailable") {
      setSelectedKeys((previous) => {
        const updated = { ...previous };
        delete updated[key];
        return updated;
      });

      const { error: deleteError } = await supabase
        .from("availability_slots")
        .delete()
        .eq("user_id", userId)
        .eq("slot_date", date)
        .eq("time_block", timeBlock);

      setSavingKey(null);

      if (deleteError) {
        setError(deleteError.message);
        void loadWeek(weekStartValue, weekEndValue);
      }

      return;
    }

    setSelectedKeys((previous) => ({ ...previous, [key]: nextStatus }));

    const { error: upsertError } = await supabase.from("availability_slots").upsert(
      {
        user_id: userId,
        slot_date: date,
        time_block: timeBlock,
        status: nextStatus,
      },
      {
        onConflict: "user_id,slot_date,time_block",
      },
    );

    setSavingKey(null);

    if (upsertError) {
      setError(upsertError.message);
      void loadWeek(weekStartValue, weekEndValue);
    }
  };

  const toggleDay = async (date: string) => {
    const keysForDay = TIME_BLOCKS.map((block) => buildAvailabilityKey(date, block.value));
    const allSelected = keysForDay.every((key) => selectedKeys[key] && selectedKeys[key] !== "unavailable");

    setError(null);

    if (allSelected) {
      // Deselect all slots for this day
      setSelectedKeys((previous) => {
        const updated = { ...previous };
        keysForDay.forEach((key) => delete updated[key]);
        return updated;
      });

      const { error: deleteError } = await supabase
        .from("availability_slots")
        .delete()
        .eq("user_id", userId)
        .eq("slot_date", date);

      if (deleteError) {
        setError(deleteError.message);
        void loadWeek(weekStartValue, weekEndValue);
      }
    } else {
      // Select all slots for this day as available
      setSelectedKeys((previous) => {
        const updated = { ...previous };
        keysForDay.forEach((key) => {
          updated[key] = "available";
        });
        return updated;
      });

      const upserts = TIME_BLOCKS.map((block) =>
        supabase.from("availability_slots").upsert(
          {
            user_id: userId,
            slot_date: date,
            time_block: block.value,
            status: "available",
          },
          {
            onConflict: "user_id,slot_date,time_block",
          },
        ),
      );

      const results = await Promise.all(upserts);
      const hasError = results.some((result) => result.error);

      if (hasError) {
        setError("Erreur lors de la sélection de la journée.");
        void loadWeek(weekStartValue, weekEndValue);
      }
    }
  };

  const toggleTimeBlock = async (timeBlock: TimeBlock) => {
    const keysForBlock = weekDays.map((day) => buildAvailabilityKey(day.date, timeBlock));
    const allSelected = keysForBlock.every((key) => selectedKeys[key] && selectedKeys[key] !== "unavailable");

    setError(null);

    if (allSelected) {
      // Deselect this time block for the entire week
      setSelectedKeys((previous) => {
        const updated = { ...previous };
        keysForBlock.forEach((key) => delete updated[key]);
        return updated;
      });

      const { error: deleteError } = await supabase
        .from("availability_slots")
        .delete()
        .eq("user_id", userId)
        .eq("time_block", timeBlock)
        .gte("slot_date", weekStartValue)
        .lte("slot_date", weekEndValue);

      if (deleteError) {
        setError(deleteError.message);
        void loadWeek(weekStartValue, weekEndValue);
      }
    } else {
      // Select this time block for the entire week as available
      setSelectedKeys((previous) => {
        const updated = { ...previous };
        keysForBlock.forEach((key) => {
          updated[key] = "available";
        });
        return updated;
      });

      const upserts = weekDays.map((day) =>
        supabase.from("availability_slots").upsert(
          {
            user_id: userId,
            slot_date: day.date,
            time_block: timeBlock,
            status: "available",
          },
          {
            onConflict: "user_id,slot_date,time_block",
          },
        ),
      );

      const results = await Promise.all(upserts);
      const hasError = results.some((result) => result.error);

      if (hasError) {
        setError("Erreur lors de la sélection du créneau.");
        void loadWeek(weekStartValue, weekEndValue);
      }
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-lg shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Semaine {weekMeta.isoWeek} - {weekMeta.isoYear}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Mes disponibilités
            </h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{weekMeta.label}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
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

        {error && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {error}
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
          <div className="grid grid-cols-[80px_repeat(3,minmax(0,1fr))] border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
            <div className="px-4 py-4">Jour</div>
            {TIME_BLOCKS.map((block) => {
              const keysForBlock = weekDays.map((day) => buildAvailabilityKey(day.date, block.value));
              const allSelected = keysForBlock.every((key) => selectedKeys[key] && selectedKeys[key] !== "unavailable");

              return (
                <button
                  key={block.value}
                  type="button"
                  onClick={() => void toggleTimeBlock(block.value)}
                  className="px-4 py-4 text-center transition hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  title={`Cliquer pour tout ${allSelected ? "désélectionner" : "sélectionner"} ce créneau`}
                >
                  {block.label}
                </button>
              );
            })}
          </div>

          {weekDays.map((day) => {
            const keysForDay = TIME_BLOCKS.map((block) => buildAvailabilityKey(day.date, block.value));
            const allSelected = keysForDay.every((key) => selectedKeys[key] && selectedKeys[key] !== "unavailable");

            return (
              <div
                key={day.date}
                className="grid grid-cols-[80px_repeat(3,minmax(0,1fr))] border-b border-zinc-200 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => void toggleDay(day.date)}
                  className="flex items-center justify-center border-r border-zinc-200 px-4 py-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  title={`Cliquer pour tout ${allSelected ? "désélectionner" : "sélectionner"} la journée`}
                >
                  <div className="text-center">
                    <p>{day.dayLabel}</p>
                    <p className="mt-1 text-sm font-semibold tracking-normal text-zinc-900 dark:text-zinc-100">
                      {day.dayNumber}
                    </p>
                  </div>
                </button>

                {TIME_BLOCKS.map((block) => {
                  const key = buildAvailabilityKey(day.date, block.value);
                  const status = selectedKeys[key];
                  const isSaving = savingKey === key;

                  return (
                    <div key={key} className="border-r border-zinc-100 p-2 last:border-r-0 dark:border-zinc-700">
                      <button
                        type="button"
                        onClick={() => toggleAvailability(day.date, block.value)}
                        disabled={isSaving}
                        className={`flex h-14 min-h-[56px] w-full flex-col items-center justify-center rounded-md border text-xs font-semibold transition sm:text-sm ${
                          status === "available"
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : status === "unsure"
                              ? "border-amber-500 bg-amber-500 text-white"
                              : "border-zinc-200 bg-white text-zinc-500 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-emerald-500 dark:hover:bg-emerald-950 dark:hover:text-emerald-300"
                        } disabled:cursor-not-allowed disabled:opacity-70`}
                        aria-label={`${TIME_BLOCK_LABELS[block.value]} - ${day.longLabel}`}
                      >
                        {isSaving ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : status === "available" ? (
                          <Check className="size-5 sm:size-6" />
                        ) : status === "unsure" ? (
                          <span className="text-lg sm:text-xl">?</span>
                        ) : (
                          <X className="size-5 sm:size-6" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
