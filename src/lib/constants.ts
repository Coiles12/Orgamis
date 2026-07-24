export const TIME_BLOCKS = [
  { value: "morning", label: "Matin" },
  { value: "noon", label: "Midi" },
  { value: "evening", label: "Soir" },
] as const;

export const TRANSPORT_MODES = [
  { value: "car_driver", label: "Voiture (conducteur)" },
  { value: "car_passenger", label: "Voiture (passager)" },
  { value: "bike", label: "Velo" },
  { value: "walking", label: "Marche" },
  { value: "public_transport", label: "Transports en commun" },
] as const;

export type TimeBlock = (typeof TIME_BLOCKS)[number]["value"];
export type TransportMode = (typeof TRANSPORT_MODES)[number]["value"];

export const TIME_BLOCK_LABELS = Object.fromEntries(
  TIME_BLOCKS.map((block) => [block.value, block.label]),
) as Record<TimeBlock, string>;

export const TRANSPORT_MODE_LABELS = Object.fromEntries(
  TRANSPORT_MODES.map((mode) => [mode.value, mode.label]),
) as Record<TransportMode, string>;
