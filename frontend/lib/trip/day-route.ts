import type { TripDay, TripDayStop, TripHotelBase, TripPlace } from "@/lib/trip/types";

export type DayRouteStopKind =
  | "airport"
  | "selected-hotel"
  | "extracted-place"
  | "known-supporting-stop"
  | "backend-stop";

export type DayRouteStop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: DayRouteStopKind;
  timeOfDay?: TripDayStop["timeOfDay"];
  category?: TripDayStop["category"] | TripPlace["category"];
};

export type DayRoutePlan = {
  day: number;
  signature: string;
  stops: DayRouteStop[];
  legs: DayRouteLeg[];
  waypoints: [number, number][];
  fallbackCoordinates: [number, number][];
};

export type DayRouteLeg = {
  id: string;
  day: number;
  sequence: number;
  from: DayRouteStop;
  to: DayRouteStop;
  waypoints: [[number, number], [number, number]];
  signature: string;
  fallbackCoordinates: [number, number][];
};

type KnownCoordinate = {
  name: string;
  lat: number;
  lng: number;
};

const NARITA_AIRPORT: KnownCoordinate = {
  name: "Narita Airport",
  lat: 35.772,
  lng: 140.3929,
};

const KNOWN_TOKYO_STOPS: KnownCoordinate[] = [
  { name: "Hamarikyu Gardens", lat: 35.6596, lng: 139.7635 },
  { name: "Hamarikyu Garden", lat: 35.6596, lng: 139.7635 },
  { name: "Tokyo Midtown", lat: 35.6659, lng: 139.7311 },
  { name: "Mandarake Complex", lat: 35.7016, lng: 139.7715 },
  { name: "Ginza Six", lat: 35.6697, lng: 139.7649 },
  { name: "Caretta Shiodome", lat: 35.6643, lng: 139.7607 },
  { name: "teamLab Planets TOKYO", lat: 35.6491, lng: 139.7898 },
  { name: "teamLab Planets Tokyo", lat: 35.6491, lng: 139.7898 },
  { name: "Ariake Garden", lat: 35.6387, lng: 139.7912 },
  { name: "The Royal Park Hotel Iconic Tokyo Shiodome", lat: 35.6655, lng: 139.7585 },
];

const knownCoordinateByKey = new Map<string, KnownCoordinate>();
KNOWN_TOKYO_STOPS.forEach((coordinate) => {
  knownCoordinateByKey.set(normalizeNameKey(coordinate.name), coordinate);
});

export function buildDayRoutePlans(
  days: TripDay[],
  places: TripPlace[],
  hotelBase?: TripHotelBase,
): DayRoutePlan[] {
  return days
    .map((day) => buildDayRoutePlan(day, places, hotelBase))
    .filter((plan) => plan.waypoints.length >= 2);
}

export function buildDayRoutePlan(
  day: TripDay,
  places: TripPlace[],
  hotelBase?: TripHotelBase,
): DayRoutePlan {
  const placeLookup = buildPlaceLookup(places);
  const stops: DayRouteStop[] = [];
  const selectedHotel = resolveSelectedHotelStop(hotelBase);

  if (shouldStartFromNarita(day, places, hotelBase)) {
    stops.push({
      id: `day-${day.day}-airport-narita`,
      name: NARITA_AIRPORT.name,
      lat: NARITA_AIRPORT.lat,
      lng: NARITA_AIRPORT.lng,
      kind: "airport",
    });
  }

  if (selectedHotel) {
    stops.push({
      ...selectedHotel,
      id: `day-${day.day}-hotel-${selectedHotel.id}`,
      kind: "selected-hotel",
    });
  }

  if (day.stops && day.stops.length > 0) {
    day.stops.forEach((stop, index) => {
      const resolved = resolveStructuredStop(day, stop, index, placeLookup, selectedHotel);
      if (resolved) {
        stops.push(resolved);
      }
    });
  } else {
    day.placeIds.forEach((placeId, index) => {
      const place = placeLookup.byId.get(placeId);
      if (!place || !isValidLngLat(place.lng, place.lat)) {
        return;
      }

      stops.push({
        id: `day-${day.day}-place-${index}-${place.id}`,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        kind: "extracted-place",
        category: place.category,
      });
    });
  }

  const dedupedStops = dedupeRouteStops(stops);
  const waypoints = dedupedStops.map((stop) => [stop.lng, stop.lat] as [number, number]);
  const legs = buildRouteLegs(day.day, dedupedStops);

  return {
    day: day.day,
    signature: buildRouteSignature(day.day, waypoints),
    stops: dedupedStops,
    legs,
    waypoints,
    fallbackCoordinates: buildFallbackRouteCoordinates(dedupedStops),
  };
}

export function buildFallbackRouteCoordinates(stops: DayRouteStop[]): [number, number][] {
  const waypoints = stops.map((stop) => [stop.lng, stop.lat] as [number, number]);
  if (waypoints.length < 2) {
    return waypoints;
  }

  const coordinates: [number, number][] = [waypoints[0]];
  for (let index = 1; index < waypoints.length; index += 1) {
    const previous = waypoints[index - 1];
    const current = waypoints[index];
    const bendFirst = Math.abs(current[0] - previous[0]) > Math.abs(current[1] - previous[1]);
    const bendA: [number, number] = bendFirst
      ? [previous[0] + (current[0] - previous[0]) * 0.58, previous[1]]
      : [previous[0], previous[1] + (current[1] - previous[1]) * 0.58];
    const bendB: [number, number] = bendFirst
      ? [previous[0] + (current[0] - previous[0]) * 0.58, current[1]]
      : [current[0], previous[1] + (current[1] - previous[1]) * 0.58];

    coordinates.push(bendA, bendB, current);
  }

  return dedupeCoordinates(coordinates);
}

export function buildFallbackRouteLegCoordinates(
  from: DayRouteStop,
  to: DayRouteStop,
): [number, number][] {
  return buildFallbackRouteCoordinates([from, to]);
}

export function findRouteLegForPlace(
  plan: DayRoutePlan,
  place: Pick<TripPlace, "id" | "name" | "lat" | "lng">,
): DayRouteLeg | null {
  const inboundLeg = plan.legs.find((leg) => routeStopMatchesPlace(leg.to, place));
  if (inboundLeg) {
    return inboundLeg;
  }

  return plan.legs.find((leg) => routeStopMatchesPlace(leg.from, place)) ?? null;
}

export function buildMapboxDirectionsUrl(
  waypoints: [number, number][],
  mapboxToken: string,
  profile: "driving" | "walking" | "cycling" = "driving",
) {
  const safeWaypoints = waypoints.filter(([lng, lat]) => isValidLngLat(lng, lat)).slice(0, 24);
  if (safeWaypoints.length < 2) {
    return "";
  }

  const coordinatePath = safeWaypoints
    .map(([lng, lat]) => `${trimCoordinate(lng)},${trimCoordinate(lat)}`)
    .join(";");
  const params = new URLSearchParams({
    access_token: mapboxToken,
    geometries: "geojson",
    overview: "full",
    steps: "false",
  });

  return `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinatePath}?${params.toString()}`;
}

export async function fetchMapboxDirectionsGeometry({
  waypoints,
  mapboxToken,
  signal,
}: {
  waypoints: [number, number][];
  mapboxToken: string;
  signal?: AbortSignal;
}): Promise<[number, number][]> {
  const url = buildMapboxDirectionsUrl(waypoints, mapboxToken);
  if (!url) {
    return [];
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    signal,
  });
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    routes?: {
      geometry?: {
        coordinates?: unknown;
      };
    }[];
  };
  const coordinates = payload.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) {
    return [];
  }

  return coordinates
    .map(readLngLatCoordinate)
    .filter((coordinate): coordinate is [number, number] => Boolean(coordinate));
}

function resolveStructuredStop(
  day: TripDay,
  stop: TripDayStop,
  index: number,
  placeLookup: ReturnType<typeof buildPlaceLookup>,
  selectedHotel: (DayRouteStop & { id: string }) | null,
): DayRouteStop | null {
  if (isValidLngLat(stop.lng, stop.lat)) {
    const lat = Number(stop.lat);
    const lng = Number(stop.lng);

    return {
      id: `day-${day.day}-stop-${index}-${slugify(stop.name)}`,
      name: stop.name,
      lat,
      lng,
      kind: "backend-stop",
      timeOfDay: stop.timeOfDay,
      category: stop.category,
    };
  }

  const place = findPlaceForStop(stop, placeLookup);
  if (place && isValidLngLat(place.lng, place.lat)) {
    return {
      id: `day-${day.day}-place-${index}-${place.id}`,
      name: stop.name || place.name,
      lat: place.lat,
      lng: place.lng,
      kind: "extracted-place",
      timeOfDay: stop.timeOfDay,
      category: stop.category || place.category,
    };
  }

  if (selectedHotel && isLikelySamePlace(stop.name, selectedHotel.name)) {
    return {
      ...selectedHotel,
      id: `day-${day.day}-hotel-stop-${index}`,
      timeOfDay: stop.timeOfDay,
      category: stop.category,
    };
  }

  const known = knownCoordinateByKey.get(normalizeNameKey(stop.name));
  if (known) {
    return {
      id: `day-${day.day}-known-${index}-${slugify(known.name)}`,
      name: stop.name || known.name,
      lat: known.lat,
      lng: known.lng,
      kind: "known-supporting-stop",
      timeOfDay: stop.timeOfDay,
      category: stop.category,
    };
  }

  return null;
}

function resolveSelectedHotelStop(hotelBase?: TripHotelBase) {
  if (!hotelBase) {
    return null;
  }

  const selectedHotel =
    hotelBase.hotelCandidates.find((hotel) => hotel.id === hotelBase.selectedHotelId) ?? null;
  if (
    selectedHotel &&
    typeof selectedHotel.lat === "number" &&
    typeof selectedHotel.lng === "number" &&
    isValidLngLat(selectedHotel.lng, selectedHotel.lat)
  ) {
    return {
      id: selectedHotel.id,
      name: selectedHotel.name || hotelBase.selectedHotelName,
      lat: selectedHotel.lat,
      lng: selectedHotel.lng,
      kind: "selected-hotel" as const,
      category: "hotel" as const,
    };
  }

  const known = knownCoordinateByKey.get(normalizeNameKey(hotelBase.selectedHotelName));
  if (!known) {
    return null;
  }

  return {
    id: hotelBase.selectedHotelId || slugify(known.name),
    name: hotelBase.selectedHotelName || known.name,
    lat: known.lat,
    lng: known.lng,
    kind: "selected-hotel" as const,
    category: "hotel" as const,
  };
}

function shouldStartFromNarita(
  day: TripDay,
  places: TripPlace[],
  hotelBase?: TripHotelBase,
) {
  if (day.day !== 1) {
    return false;
  }

  const joinedSignals = [
    day.title,
    day.summary,
    hotelBase?.selectedBaseName,
    hotelBase?.selectedHotelName,
    ...places.map((place) => `${place.name} ${place.address ?? ""}`),
  ]
    .join(" ")
    .toLowerCase();

  return ["tokyo", "shiodome", "roppongi", "narita", "akasaka", "ariake"].some((signal) =>
    joinedSignals.includes(signal),
  );
}

function buildPlaceLookup(places: TripPlace[]) {
  const byId = new Map<string, TripPlace>();
  const byName = new Map<string, TripPlace>();

  places.forEach((place) => {
    byId.set(place.id, place);
    byName.set(normalizeNameKey(place.name), place);
    byName.set(slugify(place.name), place);
  });

  return { byId, byName };
}

function findPlaceForStop(
  stop: TripDayStop,
  placeLookup: ReturnType<typeof buildPlaceLookup>,
) {
  const references = [stop.placeName, stop.name]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => [normalizeNameKey(value), slugify(value)]);

  for (const reference of references) {
    const place = placeLookup.byName.get(reference);
    if (place) {
      return place;
    }
  }

  return null;
}

function dedupeRouteStops(stops: DayRouteStop[]) {
  const seen = new Set<string>();
  const deduped: DayRouteStop[] = [];

  stops.forEach((stop) => {
    const key = `${normalizeNameKey(stop.name)}:${stop.lng.toFixed(4)},${stop.lat.toFixed(4)}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    deduped.push(stop);
  });

  return deduped;
}

function buildRouteLegs(day: number, stops: DayRouteStop[]): DayRouteLeg[] {
  const legs: DayRouteLeg[] = [];

  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1];
    const to = stops[index];
    const waypoints: [[number, number], [number, number]] = [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ];
    const sequence = index;

    legs.push({
      id: `day-${day}-leg-${sequence}`,
      day,
      sequence,
      from,
      to,
      waypoints,
      signature: buildRouteLegSignature(day, sequence, waypoints),
      fallbackCoordinates: buildFallbackRouteLegCoordinates(from, to),
    });
  }

  return legs;
}

function dedupeCoordinates(coordinates: [number, number][]) {
  const deduped: [number, number][] = [];
  coordinates.forEach((coordinate) => {
    const previous = deduped[deduped.length - 1];
    if (previous && previous[0] === coordinate[0] && previous[1] === coordinate[1]) {
      return;
    }

    deduped.push(coordinate);
  });

  return deduped;
}

function buildRouteLegSignature(
  day: number,
  sequence: number,
  coordinates: [[number, number], [number, number]],
) {
  const coordinateKey = coordinates
    .map(([lng, lat]) => `${trimCoordinate(lng)},${trimCoordinate(lat)}`)
    .join("|");

  return `day-${day}-leg-${sequence}:${coordinateKey}`;
}

function routeStopMatchesPlace(
  stop: DayRouteStop,
  place: Pick<TripPlace, "id" | "name" | "lat" | "lng">,
) {
  if (stop.id.includes(place.id) || isLikelySamePlace(stop.name, place.name)) {
    return true;
  }

  return (
    Math.abs(stop.lat - place.lat) < 0.0002 &&
    Math.abs(stop.lng - place.lng) < 0.0002
  );
}

function buildRouteSignature(day: number, coordinates: [number, number][]) {
  const coordinateKey = coordinates
    .map(([lng, lat]) => `${trimCoordinate(lng)},${trimCoordinate(lat)}`)
    .join("|");

  return `day-${day}:${coordinateKey}`;
}

function readLngLatCoordinate(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const lng = Number(value[0]);
  const lat = Number(value[1]);

  return isValidLngLat(lng, lat) ? [lng, lat] : null;
}

function isLikelySamePlace(left: string, right: string) {
  const leftKey = normalizeNameKey(left);
  const rightKey = normalizeNameKey(right);

  return leftKey === rightKey || leftKey.includes(rightKey) || rightKey.includes(leftKey);
}

function isValidLngLat(lng: unknown, lat: unknown) {
  const parsedLng = Number(lng);
  const parsedLat = Number(lat);

  return (
    Number.isFinite(parsedLng) &&
    Number.isFinite(parsedLat) &&
    parsedLng >= -180 &&
    parsedLng <= 180 &&
    parsedLat >= -90 &&
    parsedLat <= 90
  );
}

function normalizeNameKey(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/tokyo$/i, "tokyo")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slugify(value: string) {
  return normalizeNameKey(value).replace(/\s+/g, "-");
}

function trimCoordinate(value: number) {
  return Number(value.toFixed(6)).toString();
}
