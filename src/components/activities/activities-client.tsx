"use client";

import {
  CarFront,
  LoaderCircle,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/ui/modal";
import {
  TRANSPORT_MODES,
  TRANSPORT_MODE_LABELS,
  TIME_BLOCKS,
  type TransportMode,
  type TimeBlock,
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
  time_blocks: TimeBlock[];
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
  time_blocks: [],
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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedActivityView, setSelectedActivityView] = useState<ActivityView | null>(null);

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
      .select("id, created_by, title, description, location, date, status, time_block")
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

    if (activityForm.time_blocks.length === 0) {
      setMessage("Veuillez sélectionner au moins un moment de la journée.");
      setPendingAction(null);
      return;
    }

    // Create one activity with the first selected time_block
    const { error } = await supabase.from("activities").insert({
      created_by: userId,
      title: activityForm.title,
      description: activityForm.description || null,
      location: activityForm.location || null,
      date: new Date(activityForm.date).toISOString(),
      time_block: activityForm.time_blocks[0],
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
    setIsCreateModalOpen(false);
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 sm:self-start"
          >
            <Plus className="size-4" />
            Créer une activité
          </button>
        </div>
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

          return (
            <article
              key={activity.id}
              onClick={() => setSelectedActivityView(activityView)}
              className="cursor-pointer rounded-md border border-zinc-200 bg-white p-5 shadow-lg shadow-zinc-950/5 transition hover:border-emerald-300 hover:shadow-xl dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-zinc-950/50 dark:hover:border-emerald-600 sm:p-6"
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-end gap-2">
                  <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    {activity.status === "confirmed" ? "Confirmée" : activity.status}
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteActivity(activity.id);
                      }}
                      disabled={pendingAction === `delete-${activity.id}`}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
                    >
                      {pendingAction === `delete-${activity.id}` ? (
                        <LoaderCircle className="size-3 animate-spin" />
                      ) : (
                        "Supprimer"
                      )}
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 truncate">
                      {activity.title}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
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
                  </div>
                </div>
                {activity.description && (
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    {activity.description}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Créer une activité"
      >
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateActivity}>
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
              Moment de la journée
            </span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {TIME_BLOCKS.map((block) => {
                const isSelected = activityForm.time_blocks.includes(block.value);
                return (
                  <button
                    key={block.value}
                    type="button"
                    onClick={() => {
                      setActivityForm((previous) => ({
                        ...previous,
                        time_blocks: isSelected
                          ? previous.time_blocks.filter((t) => t !== block.value)
                          : [...previous.time_blocks, block.value],
                      }));
                    }}
                    className={`w-full rounded-md px-4 py-3 text-sm font-semibold transition ${
                      isSelected
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {block.label}
                  </button>
                );
              })}
            </div>
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

          <label className="block col-span-2">
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
              rows={3}
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
      </Modal>

      <Modal
        isOpen={selectedActivityView !== null}
        onClose={() => setSelectedActivityView(null)}
        title="Détails de l'activité"
      >
        {selectedActivityView && (
          <div className="space-y-6">
            <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-700 dark:bg-zinc-800">
              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <h3 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                    {selectedActivityView.activity.title}
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Le {new Date(selectedActivityView.activity.date).toLocaleString("fr-FR")}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  {selectedActivityView.activity.location && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      📍 {selectedActivityView.activity.location}
                    </p>
                  )}
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {selectedActivityView.activity.time_block
                      ? TIME_BLOCKS.find((b) => b.value === selectedActivityView.activity.time_block)?.label
                      : "Non spécifié"}
                  </p>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Créé par {selectedActivityView.creatorName}
                </p>
                {selectedActivityView.activity.description && (
                  <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words">
                    {selectedActivityView.activity.description}
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
                  value={transportSelections[selectedActivityView.activity.id] ?? "public_transport"}
                  onChange={(event) =>
                    setTransportSelections((previous) => ({
                      ...previous,
                      [selectedActivityView.activity.id]: event.target.value as TransportMode,
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
                  onClick={() => void saveTransport(selectedActivityView)}
                  disabled={pendingAction === `transport-${selectedActivityView.activity.id}`}
                  className="rounded-md bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                >
                  {pendingAction === `transport-${selectedActivityView.activity.id}`
                    ? "Enregistrement..."
                    : "Enregistrer"}
                </button>
              </div>

              {transportSelections[selectedActivityView.activity.id] === "car_driver" && (
                <div className="mt-4 rounded-md bg-zinc-50 p-4 dark:bg-zinc-700">
                  <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                    <input
                      type="text"
                      value={carForms[selectedActivityView.activity.id]?.vehicleLabel ?? ""}
                      onChange={(event) =>
                        setCarForms((previous) => ({
                          ...previous,
                          [selectedActivityView.activity.id]: {
                            ...previous[selectedActivityView.activity.id],
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
                      value={carForms[selectedActivityView.activity.id]?.seats ?? "3"}
                      onChange={(event) =>
                        setCarForms((previous) => ({
                          ...previous,
                          [selectedActivityView.activity.id]: {
                            ...previous[selectedActivityView.activity.id],
                            seats: event.target.value,
                          },
                        }))
                      }
                      className="w-full rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-emerald-500 dark:focus:ring-emerald-950"
                      placeholder="Places"
                    />
                    <button
                      type="button"
                      onClick={() => void saveCarpool(selectedActivityView)}
                      disabled={pendingAction === `car-${selectedActivityView.activity.id}`}
                      className="rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                    >
                      {pendingAction === `car-${selectedActivityView.activity.id}`
                        ? "Sauvegarde..."
                        : "Sauver la voiture"}
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
                {selectedActivityView.carpools.length === 0 && (
                  <div className="rounded-md bg-zinc-50 px-4 py-4 text-sm text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                    Aucune voiture proposée pour cette activité.
                  </div>
                )}

                {selectedActivityView.carpools.map((carpool) => {
                  const disableReservation =
                    !carpool.currentUserReserved &&
                    (carpool.seatsLeft === 0 ||
                      selectedActivityView.currentParticipation?.id ===
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
                            {carpool.seatsLeft} place(s) restante(s) on {carpool.seats_available}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            void toggleReservation(
                              selectedActivityView,
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
                {selectedActivityView.participants.length === 0 && (
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    Aucun participant n&apos;a encore renseigné son transport.
                  </span>
                )}

                {selectedActivityView.participants.map((participant) => (
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
        )}
      </Modal>
    </div>
  );
}
