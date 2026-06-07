import { buildDayRoutePlans, type DayRouteLeg, type DayRoutePlan } from "@/lib/trip/day-route";
import { isValidLngLatValue } from "@/lib/trip/geo";
import type { DayFilter, TripDay, TripHotelBase, TripPlace } from "@/lib/trip/types";

export type RouteFeatureProperties = {
  day: number;
  legIndex: number;
  fromName: string;
  toName: string;
  active: boolean;
};
export type RouteFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.LineString,
  RouteFeatureProperties
>;
export type PlaceFeatureProperties = {
  placeId: string;
  name: string;
  category: TripPlace["category"];
  day: number;
  glyph: string;
  selected: boolean;
  muted: boolean;
};
export type PlaceFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  PlaceFeatureProperties
>;
export type HotelHubFeatureProperties = {
  name: string;
  glyph: string;
  kind: "hotel" | "base";
};
export type HotelHubFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  HotelHubFeatureProperties
>;
export type RouteStopFeatureProperties = {
  name: string;
  day: number;
  sequence: number;
  active: boolean;
  kind: string;
};
export type RouteStopFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  RouteStopFeatureProperties
>;

export type HotelHub = {
  name: string;
  lng: number;
  lat: number;
  kind: "hotel" | "base";
};

export const EMPTY_ROUTE_COLLECTION: RouteFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
export const EMPTY_PLACE_COLLECTION: PlaceFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
export const EMPTY_HOTEL_HUB_COLLECTION: HotelHubFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
export const EMPTY_ROUTE_STOP_COLLECTION: RouteStopFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function deriveHotelHub(hotelBase?: TripHotelBase): HotelHub | null {
  if (!hotelBase) {
    return null;
  }

  const selectedHotel =
    hotelBase.hotelCandidates.find((hotel) => hotel.id === hotelBase.selectedHotelId) ?? null;
  if (
    selectedHotel &&
    typeof selectedHotel.lng === "number" &&
    typeof selectedHotel.lat === "number" &&
    isValidLngLat(selectedHotel.lng, selectedHotel.lat)
  ) {
    return {
      name: selectedHotel.name || hotelBase.selectedHotelName,
      lng: selectedHotel.lng,
      lat: selectedHotel.lat,
      kind: "hotel",
    };
  }

  const selectedBase =
    hotelBase.baseAreas.find((base) => base.id === hotelBase.selectedBaseId) ?? null;
  if (
    selectedBase?.center &&
    isValidLngLat(selectedBase.center.lng, selectedBase.center.lat)
  ) {
    return {
      name: selectedBase.name || hotelBase.selectedBaseName,
      lng: selectedBase.center.lng,
      lat: selectedBase.center.lat,
      kind: "base",
    };
  }

  return null;
}

export function buildRouteFeatureCollection({
  days,
  places,
  selectedDay,
  selectedRouteDay,
  activeRouteLegId,
  hotelBase,
  directionsBySignature,
}: {
  days: TripDay[];
  places: TripPlace[];
  selectedDay: DayFilter;
  selectedRouteDay: TripDay["day"] | null;
  activeRouteLegId: string | null;
  hotelBase: TripHotelBase | undefined;
  directionsBySignature: Readonly<Record<string, [number, number][]>>;
}): RouteFeatureCollection {
  const routeDays =
    selectedDay === "all" ? days : days.filter((day) => day.day === selectedDay);
  const activeRouteDay = selectedDay === "all" ? selectedRouteDay : selectedDay;
  const routePlans = buildDayRoutePlans(routeDays, places, hotelBase);
  const placeById = new globalThis.Map<string, TripPlace>();
  places.forEach((place) => {
    placeById.set(place.id, place);
  });
  const features: RouteFeatureCollection["features"] = [];

  routePlans.forEach((plan) => {
    plan.legs.forEach((leg) => {
      const coordinates = buildLegRouteCoordinates(leg, directionsBySignature);
      if (coordinates.length < 2) {
        return;
      }

      features.push({
        type: "Feature",
        id: leg.id,
        properties: {
          day: plan.day,
          legIndex: leg.sequence,
          fromName: leg.from.name,
          toName: leg.to.name,
          active: activeRouteLegId
            ? leg.id === activeRouteLegId
            : activeRouteDay !== null && plan.day === activeRouteDay,
        },
        geometry: {
          type: "LineString",
          coordinates,
        },
      });
    });
  });

  if (features.length === 0) {
    routeDays.forEach((day) => {
      const coordinates =
        day.route?.coordinates && day.route.coordinates.length >= 2
          ? day.route.coordinates
          : buildFallbackRouteCoordinates(day, placeById);

      if (coordinates.length < 2) {
        return;
      }

      features.push({
        type: "Feature",
        id: `day-${day.day}`,
        properties: {
          day: day.day,
          legIndex: 1,
          fromName: `Day ${day.day}`,
          toName: `Day ${day.day}`,
          active: activeRouteDay !== null && day.day === activeRouteDay,
        },
        geometry: {
          type: "LineString",
          coordinates,
        },
      });
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

export function buildRouteStopFeatureCollection({
  routePlans,
  selectedDay,
  activeRouteDay,
}: {
  routePlans: DayRoutePlan[];
  selectedDay: DayFilter;
  activeRouteDay: TripDay["day"] | null;
}): RouteStopFeatureCollection {
  const routeDays =
    selectedDay === "all"
      ? routePlans
      : routePlans.filter((plan) => plan.day === selectedDay);
  const highlightedDay = selectedDay === "all" ? activeRouteDay : selectedDay;

  return {
    type: "FeatureCollection",
    features: routeDays.flatMap((plan) =>
      plan.stops.map((stop, index) => ({
        type: "Feature" as const,
        id: `day-${plan.day}-route-stop-${index}`,
        properties: {
          name: stop.name,
          day: plan.day,
          sequence: index + 1,
          active: highlightedDay !== null && plan.day === highlightedDay,
          kind: stop.kind,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [stop.lng, stop.lat] as [number, number],
        },
      })),
    ),
  };
}

export function buildPlaceFeatureCollection({
  places,
  selectedPlaceId,
}: {
  places: TripPlace[];
  selectedPlaceId: string | null;
}): PlaceFeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.flatMap((place) => {
      if (!isValidLngLat(place.lng, place.lat)) {
        return [];
      }

      return [
        {
          type: "Feature",
          id: place.id,
          properties: {
            placeId: place.id,
            name: place.name,
            category: place.category,
            day: place.day,
            glyph: getMarkerGlyph(place.category),
            selected: place.id === selectedPlaceId,
            muted: selectedPlaceId !== null && place.id !== selectedPlaceId,
          },
          geometry: {
            type: "Point",
            coordinates: [place.lng, place.lat],
          },
        },
      ];
    }),
  };
}

export function buildHotelHubFeatureCollection(
  hotelHub: HotelHub | null,
): HotelHubFeatureCollection {
  if (!hotelHub) {
    return EMPTY_HOTEL_HUB_COLLECTION;
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "selected-hotel-base",
        properties: {
          name: hotelHub.name,
          glyph: hotelHub.kind === "hotel" ? "H" : "B",
          kind: hotelHub.kind,
        },
        geometry: {
          type: "Point",
          coordinates: [hotelHub.lng, hotelHub.lat],
        },
      },
    ],
  };
}

function buildLegRouteCoordinates(
  leg: DayRouteLeg,
  directionsBySignature: Readonly<Record<string, [number, number][]>>,
) {
  const directionsRoute = directionsBySignature[leg.signature];
  if (directionsRoute && directionsRoute.length >= 2) {
    return directionsRoute;
  }

  return leg.fallbackCoordinates;
}

function buildFallbackRouteCoordinates(
  day: TripDay,
  placeById: ReadonlyMap<string, TripPlace>,
): [number, number][] {
  return day.placeIds.flatMap((placeId) => {
    const place = placeById.get(placeId);
    if (!place || !isValidLngLat(place.lng, place.lat)) {
      return [];
    }

    return [[place.lng, place.lat] as [number, number]];
  });
}

function getMarkerGlyph(category: TripPlace["category"]) {
  const glyphByCategory: Partial<Record<TripPlace["category"], string>> = {
    landmark: "L",
    crossing: "X",
    temple: "T",
    shrine: "S",
    market: "M",
    restaurant: "R",
    hotel: "H",
    attraction: "A",
    transport: "T",
    activity: "A",
    station: "S",
  };

  return glyphByCategory[category] ?? "P";
}

function isValidLngLat(lng: unknown, lat: unknown) {
  return isValidLngLatValue(lng, lat);
}
