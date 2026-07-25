"use client";

import { CarFront, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/ui/modal";
import {
  TIME_BLOCKS,
  TRANSPORT_MODES,
  TRANSPORT_MODE_LABELS,
  type TimeBlock,
  type TransportMode,
} from "@/lib/constants";
import {
  getWeekDays,
  parseWeekStart,
  shiftWeek,
  toDateInputValue,
} from "@/lib/date";
import { ensureUserProfile } from "@/lib/profiles";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  ActivityParticipantRow,
  ActivityRow,
  CarpoolRow,
  ProfileRow,
  ReservationRow,
} from "@/types/app";
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
  const [selectedActivity, setSelectedActivity] = useState<ActivityRow | null>(null);
  const [activityDetails, setActivityDetails] = useState<{
    creatorName: string;
    participants: Array<ActivityParticipantRow & { displayName: string }>;
    currentParticipation?: ActivityParticipantRow;
    carpools: Array<
      CarpoolRow & {
        driverName: string;
        reservations: ReservationRow[];
        seatsTaken: number;
        seatsLeft: number;
        currentUserReserved: boolean;
      }
    >;
  } | null>(null);
  const [loadingActivityDetails, setLoadingActivityDetails] = useState(false);
  const [transportSelection, setTransportSelection] = useState<TransportMode>("public_transport");
  const [carForm, setCarForm] = useState({ vehicleLabel: "", seats: "3" });

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
          .select("id, title, date, time_block, location, status")
          .gte("date", `${from}T00:00:00Z`)
          .lte("date", `${to}T23:59:59Z`),
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
        // Show activity if date matches and either time_block matches or is null (show in all blocks)
        return activityDate === date && (!activity.time_block || activity.time_block === timeBlock);
      }
    );
  }, [activities]);

  const loadActivityDetails = useCallback(async (activityId: string) => {
    setLoadingActivityDetails(true);
    setSelectedActivity(null);
    setActivityDetails(null);

    const [activityResult, participantsResult, carpoolsResult] = await Promise.all([
      supabase.from("activities").select("*").eq("id", activityId).single(),
      supabase.from("activity_participants").select("*").eq("activity_id", activityId),
      supabase.from("carpools").select("*").eq("activity_id", activityId),
    ]);

    if (activityResult.error || participantsResult.error || carpoolsResult.error) {
      setLoadingActivityDetails(false);
      return;
    }

    const activity = activityResult.data as ActivityRow;
    const participants = (participantsResult.data ?? []) as ActivityParticipantRow[];
    const carpools = (carpoolsResult.data ?? []) as CarpoolRow[];

    const driverIds = carpools.map((carpool) => carpool.driver_participation_id);

    const { data: reservationsData, error: reservationsError } =
      driverIds.length > 0
        ? await supabase
            .from("car_seat_reservations")
            .select("*")
            .in("driver_participation_id", driverIds)
        : { data: [], error: null };

    if (reservationsError) {
      setLoadingActivityDetails(false);
      return;
    }

    const participantUserIds = participants.map((participant) => participant.user_id);
    const profileIds = Array.from(
      new Set([...participantUserIds, activity.created_by]),
    );

    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", profileIds);

    if (profilesError) {
      setLoadingActivityDetails(false);
      return;
    }

    const profiles = (profilesData ?? []) as ProfileRow[];
    const profilesById = new Map(
      profiles.map((profile) => [
        profile.id,
        profile.display_name?.trim() || "Membre",
      ]),
    );

    const reservationsByDriver = new Map<string, ReservationRow[]>();
    (reservationsData as ReservationRow[]).forEach((reservation) => {
      const list = reservationsByDriver.get(reservation.driver_participation_id) ?? [];
      list.push(reservation);
      reservationsByDriver.set(reservation.driver_participation_id, list);
    });

    const participantsById = new Map<string, ActivityParticipantRow>();
    participants.forEach((participant) => {
      participantsById.set(participant.id, participant);
    });

    const currentParticipation = participants.find(
      (participant) => participant.user_id === userId,
    );

    setTransportSelection(currentParticipation?.transport_mode ?? "public_transport");

    const enrichedCarpools = carpools.map((carpool) => {
      const driverParticipation = participantsById.get(carpool.driver_participation_id);
      const reservations = reservationsByDriver.get(carpool.driver_participation_id) ?? [];
      const seatsTaken = reservations.reduce(
        (total, reservation) => total + reservation.seats_reserved,
        0,
      );
      const seatsLeft = Math.max(0, carpool.seats_available - seatsTaken);

      return {
        ...carpool,
        driverName: profilesById.get(driverParticipation?.user_id ?? "") ?? "Conducteur",
        reservations,
        seatsTaken,
        seatsLeft,
        currentUserReserved: reservations.some(
          (reservation) => reservation.passenger_user_id === userId,
        ),
      };
    });

    setActivityDetails({
      creatorName: profilesById.get(activity.created_by) ?? "Membre",
      participants: participants.map((participant) => ({
        ...participant,
        displayName: profilesById.get(participant.user_id) ?? "Membre",
      })),
      currentParticipation,
      carpools: enrichedCarpools,
    });
    setSelectedActivity(activity);
    setLoadingActivityDetails(false);
  }, [supabase, userId]);

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
                          <button
                            key={activity.id}
                            type="button"
                            onClick={() => loadActivityDetails(activity.id)}
                            className="w-full truncate rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-900 transition hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-100 dark:hover:bg-blue-800"
                            title={activity.location || undefined}
                          >
                            {activity.title}
                          </button>
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
                {slotDetails
                  .sort((a, b) => {
                    const statusOrder = { available: 0, unsure: 1, unavailable: 2 };
                    return statusOrder[a.status] - statusOrder[b.status];
                  })
                  .map((detail) => (
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

        <Modal
          isOpen={selectedActivity !== null}
          onClose={() => setSelectedActivity(null)}
          title="Détails de l'activité"
        >
          {loadingActivityDetails ? (
            <div className="text-sm text-zinc-500">Chargement...</div>
          ) : selectedActivity && activityDetails ? (
            <div className="space-y-6">
              <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-700 dark:bg-zinc-800">
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                    <h3 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                      {selectedActivity.title}
                    </h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      Le {new Date(selectedActivity.date).toLocaleString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                    {selectedActivity.location && (
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        📍 {selectedActivity.location}
                      </p>
                    )}
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {selectedActivity.time_block
                        ? TIME_BLOCKS.find((b) => b.value === selectedActivity.time_block)?.label
                        : "Non spécifié"}
                    </p>
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Créé par {activityDetails.creatorName}
                  </p>
                  {selectedActivity.description && (
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words">
                      {selectedActivity.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-700 dark:bg-zinc-800">
                <h4 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  Mon transport
                </h4>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <select
                    value={transportSelection}
                    onChange={(event) =>
                      setTransportSelection(event.target.value as TransportMode)
                    }
                    className="w-full rounded-md border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-950"
                  >
                    {TRANSPORT_MODES.map((mode) => (
                      <option key={mode.value} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      const { error } = await supabase
                        .from("activity_participants")
                        .upsert(
                          {
                            activity_id: selectedActivity.id,
                            user_id: userId,
                            transport_mode: transportSelection,
                          },
                          { onConflict: "activity_id,user_id" },
                        );
                      if (!error) {
                        await loadActivityDetails(selectedActivity.id);
                      }
                    }}
                    className="rounded-md bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                  >
                    Enregistrer
                  </button>
                </div>

                {transportSelection === "car_driver" && (
                  <div className="mt-4 rounded-md bg-zinc-50 p-4 dark:bg-zinc-700">
                    <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                      <input
                        type="text"
                        value={carForm.vehicleLabel}
                        onChange={(e) => setCarForm((prev) => ({ ...prev, vehicleLabel: e.target.value }))}
                        className="w-full rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-950"
                        placeholder="Nom du véhicule"
                      />
                      <input
                        type="number"
                        min="1"
                        value={carForm.seats}
                        onChange={(e) => setCarForm((prev) => ({ ...prev, seats: e.target.value }))}
                        className="w-full rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-950"
                        placeholder="Places"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const seatsValue = Number(carForm.seats);
                          if (!Number.isFinite(seatsValue) || seatsValue < 1) {
                            return;
                          }

                          const { data: participation, error: participationError } = await supabase
                            .from("activity_participants")
                            .upsert(
                              {
                                activity_id: selectedActivity.id,
                                user_id: userId,
                                transport_mode: "car_driver",
                              },
                              {
                                onConflict: "activity_id,user_id",
                              },
                            )
                            .select("id")
                            .single();

                          if (participationError || !participation) {
                            return;
                          }

                          await supabase.from("carpools").upsert(
                            {
                              activity_id: selectedActivity.id,
                              driver_participation_id: participation.id,
                              seats_available: seatsValue,
                              vehicle_label: carForm.vehicleLabel || null,
                            },
                            {
                              onConflict: "driver_participation_id",
                            },
                          );

                          setTransportSelection("car_driver");
                          await loadActivityDetails(selectedActivity.id);
                        }}
                        className="rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                      >
                        Sauver la voiture
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-700 dark:bg-zinc-800">
                <div className="flex items-center gap-2">
                  <CarFront className="size-5 text-emerald-600 dark:text-emerald-400" />
                  <h4 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                    Covoitise
                  </h4>
                </div>
                <div className="mt-4 space-y-3">
                  {activityDetails.carpools.length === 0 && (
                    <div className="rounded-md bg-zinc-50 px-4 py-4 text-sm text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                      Aucune voiture proposée pour cette activité.
                    </div>
                  )}
                  {activityDetails.carpools.map((carpool) => {
                    const disableReservation =
                      !carpool.currentUserReserved &&
                      (carpool.seatsLeft === 0 ||
                        activityDetails.currentParticipation?.id ===
                          carpool.driver_participation_id);

                    return (
                      <div
                        key={carpool.id}
                        className="rounded-md border border-zinc-200 p-4 dark:border-zinc-700 dark:bg-zinc-700"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                              {carpool.vehicle_label || "Voiture"}
                            </p>
                            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                              Conducteur : {carpool.driverName}
                            </p>
                            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                              {carpool.seatsLeft} place(s) restante(s) sur {carpool.seats_available}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              if (carpool.currentUserReserved) {
                                await supabase
                                  .from("car_seat_reservations")
                                  .delete()
                                  .eq("driver_participation_id", carpool.driver_participation_id)
                                  .eq("passenger_user_id", userId);
                              } else {
                                await supabase
                                  .from("activity_participants")
                                  .upsert(
                                    {
                                      activity_id: selectedActivity.id,
                                      user_id: userId,
                                      transport_mode: "car_passenger",
                                    },
                                    { onConflict: "activity_id,user_id" },
                                  );
                                await supabase.from("car_seat_reservations").insert({
                                  driver_participation_id: carpool.driver_participation_id,
                                  passenger_user_id: userId,
                                  seats_reserved: 1,
                                });
                              }
                              await loadActivityDetails(selectedActivity.id);
                            }}
                            disabled={disableReservation}
                            className={`rounded-md px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                              carpool.currentUserReserved
                                ? "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                                : "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                            }`}
                          >
                            {carpool.currentUserReserved
                              ? "Annuler ma réservation"
                              : "Réserver 1 place"}
                          </button>
                        </div>
                        <div className="mt-4 flex items-center gap-2 text-sm text-zinc-600">
                          <Users className="size-4" />
                          {carpool.reservations.length === 0
                            ? "Aucune réservation pour l'instant"
                            : `${carpool.reservations.length} réservation(s)`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800 dark:bg-zinc-800">
                <h4 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  Participants et transports
                </h4>
                <div className="mt-4 flex flex-wrap gap-3">
                  {activityDetails.participants.length === 0 && (
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      Aucun participant n&apos;a encore renseigné son transport.
                    </span>
                  )}
                  {activityDetails.participants.map((participant) => (
                    <div
                      key={participant.id}
                      className="rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {participant.displayName} -{" "}
                      {TRANSPORT_MODE_LABELS[participant.transport_mode]}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </Modal>

        {isLoading && (
          <div className="mt-4 text-sm text-zinc-500">
            Chargement des disponibilites...
          </div>
        )}
      </section>
    </div>
  );
}
