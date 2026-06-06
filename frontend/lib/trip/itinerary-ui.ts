import type { TripDay, TripDayStop, TripPlace, TripRoute } from "@/lib/trip/types";

export type RoutePreviewStop = {
  id: string;
  name: string;
  category: TripPlace["category"] | TripDayStop["category"];
  selected: boolean;
  selectable: boolean;
  placeId?: string;
  timeOfDay?: TripDayStop["timeOfDay"];
};

export type RoutePreview = {
  day: number;
  title: string;
  summary: string;
  routeLabel: string;
  stops: RoutePreviewStop[];
};

export type ItineraryTimelineDay = RoutePreview & {
  selected: boolean;
  stopCount: number;
};

export type ItineraryTextSection = {
  label: string;
  text: string;
};

type ResolvedDayStop = {
  id: string;
  placeId?: string;
  name: string;
  category: TripPlace["category"] | TripDayStop["category"];
  selectable: boolean;
  timeOfDay?: TripDayStop["timeOfDay"];
};

const PERIOD_LABELS = ["Morning", "Afternoon", "Evening", "Night"] as const;

export function buildRoutePreview(
  place: TripPlace | null,
  days: TripDay[],
  places: TripPlace[],
): RoutePreview | null {
  if (!place) {
    return null;
  }

  const day = days.find((candidate) => candidate.day === place.day) ?? null;
  if (!day) {
    return null;
  }

  const stops = resolveDayStops(day, places);

  return {
    day: day.day,
    title: day.title || `Day ${day.day}`,
    summary: day.summary,
    routeLabel: formatRouteLabel(day.route, stops.length),
    stops: stops.map((stop) => ({
      id: stop.id,
      placeId: stop.placeId,
      name: stop.name,
      category: stop.category,
      selected: stop.placeId === place.id,
      selectable: stop.selectable,
      timeOfDay: stop.timeOfDay,
    })),
  };
}

export function buildItineraryTimeline(
  days: TripDay[],
  places: TripPlace[],
  selectedPlaceId: string | null,
): ItineraryTimelineDay[] {
  const selectedPlace = selectedPlaceId
    ? places.find((place) => place.id === selectedPlaceId) ?? null
    : null;

  return days.map((day) => {
    const stops = resolveDayStops(day, places);

    return {
      day: day.day,
      title: day.title || `Day ${day.day}`,
      summary: day.summary,
      routeLabel: formatRouteLabel(day.route, stops.length),
      selected: selectedPlace?.day === day.day,
      stopCount: stops.length,
      stops: stops.map((stop) => ({
        id: stop.id,
        placeId: stop.placeId,
        name: stop.name,
        category: stop.category,
        selected: stop.placeId === selectedPlaceId,
        selectable: stop.selectable,
        timeOfDay: stop.timeOfDay,
      })),
    };
  });
}

export function splitItineraryTextSections(value: string): ItineraryTextSection[] {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const markerPattern = new RegExp(`\\b(${PERIOD_LABELS.join("|")}):`, "gi");
  const matches = Array.from(normalized.matchAll(markerPattern));

  if (matches.length === 0) {
    return [{ label: "Plan", text: normalized }];
  }

  const sections = matches.map((match, index) => {
    const label = toTitleCase(match[1] ?? "Plan");
    const textStart = (match.index ?? 0) + match[0].length;
    const textEnd = matches[index + 1]?.index ?? normalized.length;
    const text = normalized.slice(textStart, textEnd).trim();

    return { label, text };
  });

  return sections.filter((section) => section.text.length > 0);
}

export function formatRouteLabel(route: TripRoute | undefined, stopCount: number) {
  const parts: string[] = [];

  if (typeof route?.durationMinutes === "number" && Number.isFinite(route.durationMinutes)) {
    parts.push(`${Math.round(route.durationMinutes)} min route`);
  }

  if (typeof route?.distanceKm === "number" && Number.isFinite(route.distanceKm)) {
    parts.push(`${formatDistance(route.distanceKm)} km`);
  }

  if (parts.length > 0) {
    return parts.join(" - ");
  }

  return `${stopCount} mapped ${stopCount === 1 ? "stop" : "stops"}`;
}

export function getCategoryGlyph(category: TripPlace["category"] | TripDayStop["category"] | string) {
  const glyphByCategory: Record<string, string> = {
    landmark: "L",
    crossing: "X",
    temple: "T",
    shrine: "S",
    market: "M",
    restaurant: "R",
    cafe: "C",
    hotel: "H",
    attraction: "A",
    transport: "T",
    activity: "A",
    station: "S",
    shopping: "S",
  };

  return glyphByCategory[category] ?? "P";
}

function resolveDayStops(day: TripDay, places: TripPlace[]): ResolvedDayStop[] {
  const placeById = new Map(places.map((place) => [place.id, place]));
  const placeByName = new Map<string, TripPlace>();
  places.forEach((place) => {
    placeByName.set(normalizeNameKey(place.name), place);
    placeByName.set(slugify(place.name), place);
  });

  if (day.stops && day.stops.length > 0) {
    return day.stops.map((stop, index) => {
      const place = findPlaceForStructuredStop(stop, placeByName);

      if (place) {
        return {
          id: place.id,
          placeId: place.id,
          name: stop.name || place.name,
          category: stop.category || place.category,
          selectable: true,
          timeOfDay: stop.timeOfDay,
        };
      }

      return {
        id: `day-${day.day}-${stop.timeOfDay}-${index}-${slugify(stop.name)}`,
        name: stop.name,
        category: stop.category,
        selectable: false,
        timeOfDay: stop.timeOfDay,
      };
    });
  }

  const orderedStops = day.placeIds
    .map((placeId) => placeById.get(placeId))
    .filter((place): place is TripPlace => Boolean(place))
    .map((place) => ({
      id: place.id,
      placeId: place.id,
      name: place.name,
      category: place.category,
      selectable: true,
    }));

  if (orderedStops.length > 0) {
    return orderedStops;
  }

  return places
    .filter((place) => place.day === day.day)
    .map((place) => ({
      id: place.id,
      placeId: place.id,
      name: place.name,
      category: place.category,
      selectable: true,
    }));
}

function formatDistance(distanceKm: number) {
  if (Number.isInteger(distanceKm)) {
    return String(distanceKm);
  }

  return distanceKm.toFixed(1);
}

function findPlaceForStructuredStop(
  stop: TripDayStop,
  placeByName: ReadonlyMap<string, TripPlace>,
) {
  const references = [stop.placeName, stop.name]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => [normalizeNameKey(value), slugify(value)]);

  for (const reference of references) {
    const place = placeByName.get(reference);
    if (place) {
      return place;
    }
  }

  return null;
}

function toTitleCase(value: string) {
  const lower = value.toLowerCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
}

function normalizeNameKey(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slugify(value: string) {
  return normalizeNameKey(value).replace(/\s+/g, "-");
}
