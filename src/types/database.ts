export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string;
          created_by: string;
          date: string;
          description: string | null;
          id: string;
          location: string | null;
          max_participants: number | null;
          status: "draft" | "confirmed" | "cancelled";
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          date: string;
          description?: string | null;
          id?: string;
          location?: string | null;
          max_participants?: number | null;
          status?: "draft" | "confirmed" | "cancelled";
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          date?: string;
          description?: string | null;
          id?: string;
          location?: string | null;
          max_participants?: number | null;
          status?: "draft" | "confirmed" | "cancelled";
          title?: string;
          updated_at?: string;
        };
      };
      activity_participants: {
        Row: {
          activity_id: string;
          created_at: string;
          id: string;
          note: string | null;
          transport_mode:
            | "car_driver"
            | "car_passenger"
            | "bike"
            | "walking"
            | "public_transport";
          user_id: string;
        };
        Insert: {
          activity_id: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          transport_mode:
            | "car_driver"
            | "car_passenger"
            | "bike"
            | "walking"
            | "public_transport";
          user_id: string;
        };
        Update: {
          activity_id?: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          transport_mode?:
            | "car_driver"
            | "car_passenger"
            | "bike"
            | "walking"
            | "public_transport";
          user_id?: string;
        };
      };
      availability_slots: {
        Row: {
          created_at: string;
          id: string;
          is_available: boolean;
          notes: string | null;
          slot_date: string;
          time_block: "morning" | "noon" | "evening";
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_available?: boolean;
          notes?: string | null;
          slot_date: string;
          time_block: "morning" | "noon" | "evening";
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_available?: boolean;
          notes?: string | null;
          slot_date?: string;
          time_block?: "morning" | "noon" | "evening";
          updated_at?: string;
          user_id?: string;
        };
      };
      car_seat_reservations: {
        Row: {
          created_at: string;
          driver_participation_id: string;
          id: string;
          passenger_user_id: string;
          seats_reserved: number;
        };
        Insert: {
          created_at?: string;
          driver_participation_id: string;
          id?: string;
          passenger_user_id: string;
          seats_reserved?: number;
        };
        Update: {
          created_at?: string;
          driver_participation_id?: string;
          id?: string;
          passenger_user_id?: string;
          seats_reserved?: number;
        };
      };
      carpools: {
        Row: {
          activity_id: string;
          created_at: string;
          driver_participation_id: string;
          id: string;
          seats_available: number;
          vehicle_label: string | null;
        };
        Insert: {
          activity_id: string;
          created_at?: string;
          driver_participation_id: string;
          id?: string;
          seats_available: number;
          vehicle_label?: string | null;
        };
        Update: {
          activity_id?: string;
          created_at?: string;
          driver_participation_id?: string;
          id?: string;
          seats_available?: number;
          vehicle_label?: string | null;
        };
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          is_admin: boolean;
          onboarding_completed: boolean;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          is_admin?: boolean;
          onboarding_completed?: boolean;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          is_admin?: boolean;
          onboarding_completed?: boolean;
          updated_at?: string;
        };
      };
    };
  };
};
