import type { TripMapMode } from "@/components/map/TripMap";
import { formatPriorityTheme } from "@/lib/trip/agent-copy";
import type { UserPreferencesPayload } from "@/lib/trip/backend-types";
import type { TripExperience } from "@/lib/trip/types";

export type GenerationStatus =
  | "idle_globe"
  | "extracting_places"
  | "zooming_to_destination"
  | "choosing_hotel_base"
  | "optimizing_hotel_base"
  | "planning_itinerary"
  | "trip_ready"
  | "error";

export type GenerationLog = {
  id: string;
  title: string;
  detail: string;
  tone: "info" | "success" | "warning" | "error";
};

export type SteeringState = {
  lockedHotelBase: boolean;
  lockedPlaceIds: Set<string>;
  priorityThemes: string[];
  regenerateDay: number | null;
  steeringNotes: string[];
};

export function getMapMode(
  status: GenerationStatus,
  provisionalTrip: TripExperience | null,
): TripMapMode {
  if (!provisionalTrip || status === "idle_globe" || status === "extracting_places") {
    return "globe";
  }

  if (status === "zooming_to_destination") {
    return "extracting";
  }

  return "trip";
}

export function appendSteeringSignal(
  preferences: UserPreferencesPayload,
  steeringSignal: string,
): UserPreferencesPayload {
  if (!steeringSignal) {
    return preferences;
  }

  return {
    ...preferences,
    free_text: [preferences.free_text, steeringSignal].filter(Boolean).join("\n\n"),
  };
}

export function buildSteeringSignal(steering: SteeringState, trip: TripExperience | null) {
  const lockedPlaceNames =
    trip?.places
      .filter((place) => steering.lockedPlaceIds.has(place.id))
      .map((place) => place.name) ?? [];
  const parts = [
    steering.lockedHotelBase
      ? "Keep the current hotel base unless it creates a major route issue."
      : "",
    lockedPlaceNames.length > 0
      ? `Keep these stops if still relevant: ${lockedPlaceNames.join(", ")}.`
      : "",
    steering.priorityThemes.length > 0
      ? `Prioritize ${steering.priorityThemes.map(formatPriorityTheme).join(", ")} tradeoffs.`
      : "",
    steering.regenerateDay !== null
      ? `Rework Day ${steering.regenerateDay} with better sequencing.`
      : "",
    steering.steeringNotes.length > 0
      ? `User steering notes: ${steering.steeringNotes.join(" | ")}.`
      : "",
  ].filter(Boolean);

  return parts.length > 0 ? `Agent steering for next run: ${parts.join(" ")}` : "";
}

export function parseReelUrls(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((url) => url.trim())
        .filter(Boolean),
    ),
  );
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while generating the trip.";
}

export function getBackendErrorMessage(
  error: { message?: string } | null | undefined,
  fallback: string,
) {
  return error?.message?.trim() || fallback;
}

export function readStreamEventRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readStreamEventString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function readStreamEventNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
