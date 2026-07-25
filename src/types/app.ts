import type { TimeBlock, TransportMode } from "@/lib/constants";

export type AvailabilityRow = {
  id: string;
  user_id: string;
  slot_date: string;
  time_block: TimeBlock;
  status: "available" | "unsure" | "unavailable";
};

export type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type ActivityRow = {
  id: string;
  created_by: string;
  title: string;
  description: string | null;
  location: string | null;
  date: string;
  status: "draft" | "confirmed" | "cancelled";
  time_block: TimeBlock | null;
};

export type ActivityParticipantRow = {
  id: string;
  activity_id: string;
  user_id: string;
  transport_mode: TransportMode;
  note: string | null;
};

export type CarpoolRow = {
  id: string;
  activity_id: string;
  driver_participation_id: string;
  seats_available: number;
  vehicle_label: string | null;
};

export type ReservationRow = {
  id: string;
  driver_participation_id: string;
  passenger_user_id: string;
  seats_reserved: number;
};
