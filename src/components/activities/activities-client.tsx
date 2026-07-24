"use client";

import {
  CarFront,
  LoaderCircle,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  TRANSPORT_MODES,
  TRANSPORT_MODE_LABELS,
  type TransportMode,
} from "@/lib/constants";
import { toDateTimeLocalValue } from "@/lib/date";
import { ensureUserProfile } from "@/lib/profiles";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  ActivityParticipantRow,
  ActivityRow,
  CarpoolRow,
  ProfileRow,
  ReservationRow,
} from "@/types/app";

type ActivityView = {
  activity: ActivityRow;
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
};

type ActivitiesClientProps = {
  userId: string;
  userLabel: string;
  isAdmin: boolean;
};

type ActivityFormState = {
  title: string;
  location: string;
  description: string;
  date: string;
};

type CarFormState = {
  vehicleLabel: string;
  seats: string;
};

const initialActivityForm: ActivityFormState = {
  title: "",
  location: "",
  description: "",
  date: toDateTimeLocalValue(new Date()),
};

export function ActivitiesClient({ userId, userLabel, isAdmin }: ActivitiesClientProps) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [activities, setActivities] = useState<ActivityView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activityForm, setActivityForm] =
    useState<ActivityFormState>(initialActivityForm);
  const [transportSelections, setTransportSelections] = useState<
    Record<string, TransportMode>
  >({});
  const [carForms, setCarForms] = useState<Record<string, CarFormState>>({});

  const sortedActivities = useMemo(
    () =>
      [...activities].sort(
        (left, right) =>
          new Date(left.activity.date).getTime() -
          new Date(right.activity.date).getTime(),
      ),
    [activities],
  );

  const loadActivities = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    await ensureUserProfile(supabase, userId, userLabel);

    const { data: activitiesData, error: activitiesError } = await supabase
      .from("activities")
      .select("id, created_by, title, description, location, date, status")
      .order("date", { ascending: true });

    if (activitiesError) {
      setIsLoading(false);
      setMessage("Impossible de charger les activités.");
      return;
    }

    const activityRows = (activitiesData ?? []) as ActivityRow[];

    if (activityRows.length === 0) {
      setActivities([]);
      setTransportSelections({});
      setCarForms({});
      setIsLoading(false);
      return;
    }

    const activityIds = activityRows.map((activity) => activity.id);

    const [participantsResult, carpoolsResult] = await Promise.all([
      supabase
        .from("activity_participants")
        .select("id, activity_id, user_id, transport_mode, note")
        .in("activity_id", activityIds),
      supabase
        .from("carpools")
        .select("id, activity_id, driver_participation_id, seats_available, vehicle_label")
        .in("activity_id", activityIds),
    ]);

    if (participantsResult.error || carpoolsResult.error) {
      setIsLoading(false);
      setMessage("Impossible de charger les détails des activités.");
      return;
    }

    const participantRows = (participantsResult.data ?? []) as ActivityParticipantRow[];
    const carpoolRows = (carpoolsResult.data ?? []) as CarpoolRow[];
    const driverIds = carpoolRows.map((carpool) => carpool.driver_participation_id);

    const { data: reservationsData, error: reservationsError } =
      driverIds.length > 0
        ? await supabase
            .from("car_seat_reservations")
            .select("id, driver_participation_id, passenger_user_id, seats_reserved")
            .in("driver_participation_id", driverIds)
        : { data: [], error: null };

    if (reservationsError) {
      setIsLoading(false);
      setMessage("Impossible de charger les réservations.");
      return;
    }

    const participantUserIds = participantRows.map((participant) => participant.user_id);
    const profileIds = Array.from(
      new Set([...participantUserIds, ...activityRows.map((activity) => activity.created_by)]),
    );

    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", profileIds);

    if (profilesError) {
      setIsLoading(false);
      setMessage("Impossible de charger les profils du groupe.");
      return;
    }

    const profiles = (profilesData ?? []) as ProfileRow[];
    const profilesById = new Map(
      profiles.map((profile) => [
        profile.id,
        profile.display_name?.trim() || "Membre",
      ]),
    );
    const participantsByActivity = new Map<string, ActivityParticipantRow[]>();
    const participantsById = new Map<string, ActivityParticipantRow>();
    const reservationsByDriver = new Map<string, ReservationRow[]>();

    participantRows.forEach((participant) => {
      const list = participantsByActivity.get(participant.activity_id) ?? [];
      list.push(participant);
      participantsByActivity.set(participant.activity_id, list);
      participantsById.set(participant.id, participant);
    });

    (reservationsData as ReservationRow[]).forEach((reservation) => {
      const list =
        reservationsByDriver.get(reservation.driver_participation_id) ?? [];
      list.push(reservation);
      reservationsByDriver.set(reservation.driver_participation_id, list);
    });

    const nextTransportSelections: Record<string, TransportMode> = {};
    const nextCarForms: Record<string, CarFormState> = {};

    const nextActivities = activityRows.map((activity) => {
      const participants = participantsByActivity.get(activity.id) ?? [];
      const currentParticipation = participants.find(
        (participant) => participant.user_id === userId,
      );
      const enrichedParticipants = participants.map((participant) => ({
        ...participant,
        displayName: profilesById.get(participant.user_id) ?? "Membre",
      }));

      nextTransportSelections[activity.id] =
        currentParticipation?.transport_mode ?? "public_transport";

      const enrichedCarpools = carpoolRows
        .filter((carpool) => carpool.activity_id === activity.id)
        .map((carpool) => {
          const driverParticipation = participantsById.get(
            carpool.driver_participation_id,
          );
          const reservations =
            reservationsByDriver.get(carpool.driver_participation_id) ?? [];
          const seatsTaken = reservations.reduce(
            (total, reservation) => total + reservation.seats_reserved,
            0,
          );
          const seatsLeft = Math.max(0, carpool.seats_available - seatsTaken);

          if (driverParticipation?.user_id === userId) {
            nextCarForms[activity.id] = {
              vehicleLabel: carpool.vehicle_label ?? "",
              seats: String(carpool.seats_available),
            };
          }

          return {
            ...carpool,
            driverName:
              profilesById.get(driverParticipation?.user_id ?? "") ?? "Conducteur",
            reservations,
            seatsTaken,
            seatsLeft,
            currentUserReserved: reservations.some(
              (reservation) => reservation.passenger_user_id === userId,
            ),
          };
        });

      if (!nextCarForms[activity.id]) {
        nextCarForms[activity.id] = {
          vehicleLabel: "",
          seats: "3",
        };
      }

      return {
        activity,
        creatorName: profilesById.get(activity.created_by) ?? "Membre",
        participants: enrichedParticipants,
        currentParticipation,
        carpools: enrichedCarpools,
      };
    });

    setActivities(nextActivities);
    setTransportSelections(nextTransportSelections);
    setCarForms(nextCarForms);
    setIsLoading(false);
  }, [supabase, userLabel, userId]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const handleCreateActivity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPendingAction("create-activity");
    setMessage(null);

    const { error } = await supabase.from("activities").insert({
      created_by: userId,
      title: activityForm.title,
      description: activityForm.description || null,
      location: activityForm.location || null,
      date: new Date(activityForm.date).toISOString(),
      status: "confirmed",
    });

    setPendingAction(null);

    if (error) {
      setMessage(error.message);
      return;
    }

    setActivityForm({
      ...initialActivityForm,
      date: toDateTimeLocalValue(new Date()),
    });
    await loadActivities();
  };

  const saveTransport = async (activityView: ActivityView) => {
    const nextMode = transportSelections[activityView.activity.id];
    const driverParticipation = activityView.currentParticipation;
    const currentCarpool = activityView.carpools.find(
      (carpool) => carpool.driver_participation_id === driverParticipation?.id,
    );

    setPendingAction(`transport-${activityView.activity.id}`);
    setMessage(null);

    if (
      currentCarpool &&
      nextMode !== "car_driver" &&
      driverParticipation?.id === currentCarpool.driver_participation_id
    ) {
      const { error: deleteReservationsError } = await supabase
        .from("car_seat_reservations")
        .delete()
        .eq("driver_participation_id", currentCarpool.driver_participation_id);

      if (deleteReservationsError) {
        setPendingAction(null);
        setMessage(deleteReservationsError.message);
        return;
      }

      const { error: deleteCarpoolError } = await supabase
        .from("carpools")
        .delete()
        .eq("driver_participation_id", currentCarpool.driver_participation_id);

      if (deleteCarpoolError) {
        setPendingAction(null);
        setMessage(deleteCarpoolError.message);
        return;
      }
    }

    const { error } = await supabase.from("activity_participants").upsert(
      {
        activity_id: activityView.activity.id,
        user_id: userId,
        transport_mode: nextMode,
      },
      {
        onConflict: "activity_id,user_id",
      },
    );

    setPendingAction(null);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadActivities();
  };

  const saveCarpool = async (activityView: ActivityView) => {
    const activityId = activityView.activity.id;
    const form = carForms[activityId];
    const seatsValue = Number(form.seats);

    if (!Number.isFinite(seatsValue) || seatsValue < 1) {
      setMessage("Le nombre de places doit être supérieur ou égal à 1.");
      return;
    }

    setPendingAction(`car-${activityId}`);
    setMessage(null);

    const { data: participation, error: participationError } = await supabase
      .from("activity_participants")
      .upsert(
        {
          activity_id: activityId,
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
      setPendingAction(null);
      setMessage(participationError?.message ?? "Participation introuvable.");
      return;
    }

    const { error: carpoolError } = await supabase.from("carpools").upsert(
      {
        activity_id: activityId,
        driver_participation_id: participation.id,
        seats_available: seatsValue,
        vehicle_label: form.vehicleLabel || null,
      },
      {
        onConflict: "driver_participation_id",
      },
    );

    setPendingAction(null);

    if (carpoolError) {
      setMessage(carpoolError.message);
      return;
    }

    setTransportSelections((previous) => ({
      ...previous,
      [activityId]: "car_driver",
    }));
    await loadActivities();
  };

  const toggleReservation = async (
    activityView: ActivityView,
    driverParticipationId: string,
    alreadyReserved: boolean,
  ) => {
    setPendingAction(`reserve-${driverParticipationId}`);
    setMessage(null);

    if (alreadyReserved) {
      const { error } = await supabase
        .from("car_seat_reservations")
        .delete()
        .eq("driver_participation_id", driverParticipationId)
        .eq("passenger_user_id", userId);

      setPendingAction(null);

      if (error) {
        setMessage(error.message);
        return;
      }

      await loadActivities();
      return;
    }

    const { error: participationError } = await supabase
      .from("activity_participants")
      .upsert(
        {
          activity_id: activityView.activity.id,
          user_id: userId,
          transport_mode: "car_passenger",
        },
        {
          onConflict: "activity_id,user_id",
        },
      );

    if (participationError) {
      setPendingAction(null);
      setMessage(participationError.message);
      return;
    }

    const { error: reservationError } = await supabase
      .from("car_seat_reservations")
      .insert({
        driver_participation_id: driverParticipationId,
        passenger_user_id: userId,
        seats_reserved: 1,
      });

    setPendingAction(null);

    if (reservationError) {
      setMessage(reservationError.message);
      return;
    }

    await loadActivities();
  };

  const deleteActivity = async (activityId: string) => {
    setPendingAction(`delete-${activityId}`);
    setMessage(null);

    const { error } = await supabase
      .from("activities")
      .delete()
      .eq("id", activityId);

    setPendingAction(null);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadActivities();
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-lg shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-zinc-950/50 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Planifier une sortie
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Activités et transport
            </h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Créez une activité, indiquez votre moyen de transport et gérez les
              réservations de places en voiture.
            </p>
          </div>
        </div>

        <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleCreateActivity}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Titre
            </span>
            <input
              type="text"
              value={activityForm.title}
              onChange={(event) =>
                setActivityForm((previous) => ({
                  ...previous,
                  title: event.target.value,
                }))
              }
              required
              className="w-full rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-950"
              placeholder="Pique-nique, cinema, bowling..."
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Date et heure
            </span>
            <input
              type="datetime-local"
              value={activityForm.date}
              onChange={(event) =>
                setActivityForm((previous) => ({
                  ...previous,
                  date: event.target.value,
                }))
              }
              required
              className="w-full rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-950"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Lieu
            </span>
            <input
              type="text"
              value={activityForm.location}
              onChange={(event) =>
                setActivityForm((previous) => ({
                  ...previous,
                  location: event.target.value,
                }))
              }
              className="w-full rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-950"
              placeholder="Adresse ou point de rendez-vous"
            />
          </label>

          <label className="block md:row-span-2">
            <span className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Description
            </span>
            <textarea
              value={activityForm.description}
              onChange={(event) =>
                setActivityForm((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))
              }
              rows={5}
              className="w-full rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-950"
              placeholder="Infos utiles pour le groupe"
            />
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={pendingAction === "create-activity"}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingAction === "create-activity" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Créer l&apos;activité
            </button>
          </div>
        </form>

        {message && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {message}
          </div>
        )}
      </section>

      <section className="space-y-4">
        {isLoading && (
          <div className="rounded-md border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-500 shadow-lg shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Chargement des activités...
          </div>
        )}

        {!isLoading && sortedActivities.length === 0 && (
          <div className="rounded-md border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-500 shadow-lg shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Aucune activité pour le moment. Créez la première sortie du groupe.
          </div>
        )}

        {sortedActivities.map((activityView) => {
          const activity = activityView.activity;
          const transportValue =
            transportSelections[activity.id] ?? "public_transport";
          const currentUserIsDriver = transportValue === "car_driver";
          const currentCarForm = carForms[activity.id] ?? {
            vehicleLabel: "",
            seats: "3",
          };

          return (
            <article
              key={activity.id}
              className="rounded-md border border-zinc-200 bg-white p-5 shadow-lg shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-zinc-950/50 sm:p-6"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                    {activity.title}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                    <span>Le {new Date(activity.date).toLocaleString("fr-FR")}</span>
                    <span>•</span>
                    <span>Créé par {activityView.creatorName}</span>
                  </div>
                  {activity.location && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <MapPin className="size-4" />
                      {activity.location}
                    </div>
                  )}
                  {activity.description && (
                    <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                      {activity.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    {activity.status === "confirmed" ? "Confirmée" : activity.status}
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => void deleteActivity(activity.id)}
                      disabled={pendingAction === `delete-${activity.id}`}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
                    >
                      {pendingAction === `delete-${activity.id}` ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        "Supprimer"
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800 dark:bg-zinc-800">
                  <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                    Mon transport
                  </h3>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <select
                      value={transportValue}
                      onChange={(event) =>
                        setTransportSelections((previous) => ({
                          ...previous,
                          [activity.id]: event.target.value as TransportMode,
                        }))
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
                      onClick={() => void saveTransport(activityView)}
                      disabled={pendingAction === `transport-${activity.id}`}
                      className="rounded-md bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                    >
                      {pendingAction === `transport-${activity.id}`
                        ? "Enregistrement..."
                        : "Enregistrer"}
                    </button>
                  </div>

                  {currentUserIsDriver && (
                    <div className="mt-4 rounded-md bg-zinc-50 p-4 dark:bg-zinc-700">
                      <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                        <input
                          type="text"
                          value={currentCarForm.vehicleLabel}
                          onChange={(event) =>
                            setCarForms((previous) => ({
                              ...previous,
                              [activity.id]: {
                                ...previous[activity.id],
                                vehicleLabel: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-950"
                          placeholder="Nom du véhicule"
                        />
                        <input
                          type="number"
                          min="1"
                          value={currentCarForm.seats}
                          onChange={(event) =>
                            setCarForms((previous) => ({
                              ...previous,
                              [activity.id]: {
                                ...previous[activity.id],
                                seats: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-950"
                          placeholder="Places"
                        />
                        <button
                          type="button"
                          onClick={() => void saveCarpool(activityView)}
                          disabled={pendingAction === `car-${activity.id}`}
                          className="rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                        >
                          {pendingAction === `car-${activity.id}`
                            ? "Sauvegarde..."
                            : "Sauver la voiture"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800 dark:bg-zinc-800">
                  <div className="flex items-center gap-2">
                    <CarFront className="size-5 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                      Covoitise
                    </h3>
                  </div>

                  <div className="mt-4 space-y-3">
                    {activityView.carpools.length === 0 && (
                      <div className="rounded-md bg-zinc-50 px-4 py-4 text-sm text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                        Aucune voiture proposée pour cette activité.
                      </div>
                    )}

                    {activityView.carpools.map((carpool) => {
                      const disableReservation =
                        !carpool.currentUserReserved &&
                        (carpool.seatsLeft === 0 ||
                          activityView.currentParticipation?.id ===
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
                                {carpool.seatsLeft} place(s) restante(s) sur{" "}
                                {carpool.seats_available}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                void toggleReservation(
                                  activityView,
                                  carpool.driver_participation_id,
                                  carpool.currentUserReserved,
                                )
                              }
                              disabled={
                                pendingAction ===
                                  `reserve-${carpool.driver_participation_id}` ||
                                disableReservation
                              }
                              className={`rounded-md px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                carpool.currentUserReserved
                                  ? "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                                  : "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                              }`}
                            >
                              {pendingAction ===
                              `reserve-${carpool.driver_participation_id}`
                                ? "Traitement..."
                                : carpool.currentUserReserved
                                  ? "Annuler ma réservation"
                                  : "Réserver 1 place"}
                            </button>
                          </div>

                          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-600">
                            <Users className="size-4" />
                            {carpool.reservations.length === 0
                              ? "Aucune réservation pour l'instant"
                              : `${carpool.reservations.length} réservation(s) enregistrée(s)`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-md border border-zinc-200 p-4 dark:border-zinc-800 dark:bg-zinc-800">
                <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  Participants et transports
                </h3>
                <div className="mt-4 flex flex-wrap gap-3">
                  {activityView.participants.length === 0 && (
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      Aucun participant n&apos;a encore renseigné son transport.
                    </span>
                  )}

                  {activityView.participants.map((participant) => (
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
            </article>
          );
        })}
      </section>
    </div>
  );
}
