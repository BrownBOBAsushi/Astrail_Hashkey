"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map,
  MapLayerMouseEvent,
} from "mapbox-gl";
import { coerceSafeMapCenter, isValidLngLatValue } from "@/lib/trip/geo";
import {
  buildDayRoutePlans,
  fetchMapboxDirectionsGeometry,
  findRouteLegForPlace,
} from "@/lib/trip/day-route";
import {
  buildHotelHubFeatureCollection,
  buildPlaceFeatureCollection,
  buildRouteFeatureCollection,
  buildRouteStopFeatureCollection,
  deriveHotelHub,
  type HotelHubFeatureCollection,
  type PlaceFeatureCollection,
  type RouteFeatureCollection,
  type RouteStopFeatureCollection,
} from "@/lib/trip/map-feature-collections";
import {
  HOTEL_HUB_SOURCE_ID,
  PLACE_CLUSTER_HITBOX_LAYER_ID,
  PLACE_HITBOX_LAYER_ID,
  PLACE_SELECTED_PULSE_LAYER_ID,
  PLACE_SOURCE_ID,
  ROUTE_ACTIVE_DASH_LAYER_ID,
  ROUTE_DASH_SEQUENCE,
  ROUTE_SOURCE_ID,
  ROUTE_STOP_SOURCE_ID,
  addReliable3DBuildingsLayer,
  ensureHotelHubLayers,
  ensurePlaceLayers,
  ensureRouteLayers,
  ensureRouteStopLayers,
} from "@/lib/trip/map-layers";
import {
  getMapCalloutPosition,
  type MapCalloutPosition,
} from "@/lib/trip/map-overlay";
import {
  getUnknownErrorMessage,
  redactMapboxAccessToken,
  registerMapRuntimeGuards,
} from "@/lib/trip/map-runtime";
import type { DayFilter, TripDay, TripHotelBase, TripPlace } from "@/lib/trip/types";

export type TripMapMode = "globe" | "extracting" | "trip";

type TripMapProps = {
  mode?: TripMapMode;
  mapboxToken: string;
  center: {
    lat: number;
    lng: number;
  };
  initialZoom: number;
  days: TripDay[];
  selectedDay: DayFilter;
  selectedRouteDay?: TripDay["day"] | null;
  places: TripPlace[];
  routePlaces?: TripPlace[];
  selectedPlace: TripPlace | null;
  hotelBase?: TripHotelBase;
  onSelectPlace: (placeId: string) => void;
  onRegionFocusComplete?: () => void;
};

type SelectedPlaceCalloutLayout = MapCalloutPosition & {
  width: number;
  height: number;
  markerY: number;
};

const STANDARD_DAY_PITCH = 56;
const STANDARD_DAY_BEARING = -22;
const SELECTED_PLACE_PITCH = 60;
const SELECTED_PLACE_BEARING = -30;
const GLOBE_ZOOM = 1.28;
const GLOBE_PITCH = 0;
const GLOBE_BEARING = -24;
const GLOBE_ROTATION_SPEED = 0.035;
const STANDARD_ARCHITECTURAL_BASEMAP_CONFIG = {
  lightPreset: "day",
  theme: "default",
  show3dBuildings: true,
  show3dFacades: true,
  show3dLandmarks: true,
  show3dTrees: false,
  showPlaceLabels: true,
  showPointOfInterestLabels: true,
  showLandmarkIcons: true,
  showLandmarkIconLabels: true,
  showRoadLabels: true,
  showTransitLabels: true,
  showPedestrianRoads: true,
};
const USE_SAFE_3D_FALLBACK = false;

export function TripMap({
  mode = "trip",
  mapboxToken,
  center,
  initialZoom,
  days,
  selectedDay,
  selectedRouteDay,
  places,
  routePlaces,
  selectedPlace,
  hotelBase,
  onSelectPlace,
  onRegionFocusComplete,
}: TripMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onSelectPlaceRef = useRef(onSelectPlace);
  const onRegionFocusCompleteRef = useRef(onRegionFocusComplete);
  const cleanupMapRuntimeGuardsRef = useRef<(() => void) | null>(null);
  const previousFlyToPlaceIdRef = useRef<string | null>(null);
  const focusedPlaceSignatureRef = useRef<string | null>(null);
  const autoRotateFrameRef = useRef<number | null>(null);
  const selectedPulseFrameRef = useRef<number | null>(null);
  const routeDashFrameRef = useRef<number | null>(null);
  const prefersReducedMotionRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [selectedCalloutLayout, setSelectedCalloutLayout] =
    useState<SelectedPlaceCalloutLayout | null>(null);
  const [directionsBySignature, setDirectionsBySignature] = useState<
    Record<string, [number, number][]>
  >({});
  const safeCenter = useMemo(
    () => coerceSafeMapCenter(center),
    [center.lat, center.lng],
  );
  const routeSourcePlaces = routePlaces ?? places;
  const activeRouteDay = selectedDay === "all"
    ? selectedRouteDay ?? selectedPlace?.day ?? null
    : selectedDay;
  const routePlans = useMemo(
    () => buildDayRoutePlans(days, routeSourcePlaces, hotelBase),
    [days, hotelBase, routeSourcePlaces],
  );
  const activeRouteLegId = useMemo(() => {
    if (!selectedPlace) {
      return null;
    }

    const selectedDayPlan = routePlans.find((plan) => plan.day === selectedPlace.day);
    return selectedDayPlan ? findRouteLegForPlace(selectedDayPlan, selectedPlace)?.id ?? null : null;
  }, [routePlans, selectedPlace]);
  const routeCollection = useMemo(
    () =>
      buildRouteFeatureCollection({
        days,
        places: routeSourcePlaces,
        selectedDay,
        selectedRouteDay: activeRouteDay,
        activeRouteLegId,
        hotelBase,
        directionsBySignature,
      }),
    [
      activeRouteDay,
      activeRouteLegId,
      days,
      directionsBySignature,
      hotelBase,
      routeSourcePlaces,
      selectedDay,
    ],
  );
  const routeStopCollection = useMemo(
    () => buildRouteStopFeatureCollection({ routePlans, selectedDay, activeRouteDay }),
    [activeRouteDay, routePlans, selectedDay],
  );
  const hotelHub = useMemo(
    () => deriveHotelHub(hotelBase),
    [hotelBase],
  );
  const hotelHubCollection = useMemo(
    () => buildHotelHubFeatureCollection(hotelHub),
    [hotelHub],
  );
  const hotelHubName = hotelHubCollection.features[0]?.properties?.name ?? null;
  const placeCollection = useMemo(
    () => buildPlaceFeatureCollection({ places, selectedPlaceId: selectedPlace?.id ?? null }),
    [places, selectedPlace?.id],
  );
  const hasActiveRoute = useMemo(
    () => routeCollection.features.some((feature) => feature.properties.active),
    [routeCollection],
  );
  const selectedPlaceDay = useMemo(
    () => days.find((day) => day.day === selectedPlace?.day) ?? null,
    [days, selectedPlace?.day],
  );
  const selectedCalloutReason = useMemo(
    () => buildMapCalloutReason(selectedPlace, selectedPlaceDay),
    [selectedPlace, selectedPlaceDay],
  );
  const selectedCalloutEvidence = useMemo(
    () => buildMapCalloutEvidence(selectedPlace, selectedPlaceDay),
    [selectedPlace, selectedPlaceDay],
  );

  useEffect(() => {
    onSelectPlaceRef.current = onSelectPlace;
  }, [onSelectPlace]);

  useEffect(() => {
    onRegionFocusCompleteRef.current = onRegionFocusComplete;
  }, [onRegionFocusComplete]);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      prefersReducedMotionRef.current = motionQuery.matches;
    };

    updateMotionPreference();
    motionQuery.addEventListener("change", updateMotionPreference);

    return () => {
      motionQuery.removeEventListener("change", updateMotionPreference);
    };
  }, []);

  useEffect(() => {
    if (!mapboxToken || mapRef.current || !mapContainerRef.current) {
      return;
    }

    let isMounted = true;

    async function initializeMap() {
      const mapboxModule = await import("mapbox-gl");
      const mapboxgl = mapboxModule.default;

      if (!isMounted || !mapContainerRef.current || mapRef.current) {
        return;
      }

      mapboxgl.accessToken = mapboxToken;

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/standard",
        config: {
          basemap: getBasemapConfig(mode),
        },
        center: [safeCenter.lng, safeCenter.lat],
        zoom: getInitialCameraZoom(initialZoom, mode),
        pitch: getInitialCameraPitch(mode),
        bearing: getInitialCameraBearing(mode),
        projection: mode === "trip" ? "mercator" : "globe",
        antialias: true,
        attributionControl: false,
        maxPitch: 75,
      });

      map.addControl(
        new mapboxgl.NavigationControl({
          visualizePitch: true,
        }),
        "bottom-left",
      );

      map.addControl(
        new mapboxgl.AttributionControl({
          compact: true,
        }),
        "bottom-right",
      );

      mapRef.current = map;
      cleanupMapRuntimeGuardsRef.current = registerMapRuntimeGuards(map);

      map.once("load", () => {
        applyAtmosphere(map, mode);
        if (USE_SAFE_3D_FALLBACK) {
          addReliable3DBuildingsLayer(map);
        }
        ensureRouteLayers(map);
        ensureRouteStopLayers(map);
        ensurePlaceLayers(map);
        ensureHotelHubLayers(map);
        registerPlaceInteractions(map, prefersReducedMotionRef, onSelectPlaceRef);
        map.resize();
        if (isMounted) {
          setMapReady(true);
        }
      });

      requestAnimationFrame(() => {
        map.resize();
      });
    }

    initializeMap().catch((error: unknown) => {
      if (!isMounted) {
        return;
      }

      console.warn(
        "[TripCanvas map] Map initialization failed.",
        redactMapboxAccessToken(getUnknownErrorMessage(error)),
      );
    });

    return () => {
      isMounted = false;
      if (selectedPulseFrameRef.current !== null) {
        cancelAnimationFrame(selectedPulseFrameRef.current);
        selectedPulseFrameRef.current = null;
      }
      if (routeDashFrameRef.current !== null) {
        cancelAnimationFrame(routeDashFrameRef.current);
        routeDashFrameRef.current = null;
      }
      cleanupMapRuntimeGuardsRef.current?.();
      cleanupMapRuntimeGuardsRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [mapboxToken]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    map.setProjection(mode === "trip" ? "mercator" : "globe");
    applyAtmosphere(map, mode);

    if (mode === "globe" && places.length === 0) {
      const globeCamera = {
        center: [safeCenter.lng, safeCenter.lat] as [number, number],
        zoom: GLOBE_ZOOM,
        pitch: GLOBE_PITCH,
        bearing: GLOBE_BEARING,
      } satisfies Parameters<Map["jumpTo"]>[0];

      if (prefersReducedMotionRef.current) {
        map.jumpTo(globeCamera);
        return;
      }

      map.easeTo({
        ...globeCamera,
        duration: 900,
        essential: false,
      });
    }
  }, [mapReady, mode, places.length, safeCenter.lat, safeCenter.lng]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || mode !== "globe" || places.length > 0) {
      if (autoRotateFrameRef.current !== null) {
        cancelAnimationFrame(autoRotateFrameRef.current);
        autoRotateFrameRef.current = null;
      }
      return;
    }

    if (prefersReducedMotionRef.current) {
      return;
    }

    const map = mapRef.current;
    const rotate = () => {
      map.setBearing((map.getBearing() + GLOBE_ROTATION_SPEED) % 360);
      autoRotateFrameRef.current = requestAnimationFrame(rotate);
    };

    autoRotateFrameRef.current = requestAnimationFrame(rotate);

    return () => {
      if (autoRotateFrameRef.current !== null) {
        cancelAnimationFrame(autoRotateFrameRef.current);
        autoRotateFrameRef.current = null;
      }
    };
  }, [mapReady, mode, places.length]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    ensureRouteLayers(map);

    const source = map.getSource(ROUTE_SOURCE_ID);
    if (source && "setData" in source) {
      (source as GeoJSONSource).setData(routeCollection);
    }
  }, [mapReady, routeCollection]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    ensureRouteStopLayers(map);

    const source = map.getSource(ROUTE_STOP_SOURCE_ID);
    if (source && "setData" in source) {
      (source as GeoJSONSource).setData(routeStopCollection);
    }
  }, [mapReady, routeStopCollection]);

  useEffect(() => {
    if (!mapboxToken || mode === "globe" || routePlans.length === 0) {
      setDirectionsBySignature({});
      return;
    }

    const controller = new AbortController();
    let active = true;

    Promise.all(
      routePlans.flatMap((plan) => plan.legs).map(async (leg) => {
        const geometry = await fetchMapboxDirectionsGeometry({
          waypoints: leg.waypoints,
          mapboxToken,
          signal: controller.signal,
        });

        return [leg.signature, geometry] as const;
      }),
    )
      .then((entries) => {
        if (!active || controller.signal.aborted) {
          return;
        }

        const nextDirections: Record<string, [number, number][]> = {};
        entries.forEach(([signature, geometry]) => {
          if (geometry.length >= 2) {
            nextDirections[signature] = geometry;
          }
        });
        setDirectionsBySignature(nextDirections);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        console.warn(
          "[TripCanvas map] Directions route unavailable; using shaped route fallback.",
          redactMapboxAccessToken(getUnknownErrorMessage(error)),
        );
        setDirectionsBySignature({});
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [mapboxToken, mode, routePlans]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    ensurePlaceLayers(map);
    updatePlaceSource(map, placeCollection);
  }, [mapReady, placeCollection]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    ensureHotelHubLayers(map);
    updateHotelHubSource(map, hotelHubCollection);
  }, [hotelHubCollection, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    ensurePlaceLayers(map);

    if (selectedPulseFrameRef.current !== null) {
      cancelAnimationFrame(selectedPulseFrameRef.current);
      selectedPulseFrameRef.current = null;
    }

    if (!selectedPlace || prefersReducedMotionRef.current) {
      if (map.getLayer(PLACE_SELECTED_PULSE_LAYER_ID)) {
        map.setPaintProperty(PLACE_SELECTED_PULSE_LAYER_ID, "circle-radius", 32);
        map.setPaintProperty(PLACE_SELECTED_PULSE_LAYER_ID, "circle-opacity", 0.2);
      }
      return;
    }

    const animatePulse = (timestamp: number) => {
      if (!map.getLayer(PLACE_SELECTED_PULSE_LAYER_ID)) {
        return;
      }

      const progress = (timestamp % 1400) / 1400;
      const radius = 28 + progress * 18;
      const opacity = 0.26 - progress * 0.18;
      map.setPaintProperty(PLACE_SELECTED_PULSE_LAYER_ID, "circle-radius", radius);
      map.setPaintProperty(PLACE_SELECTED_PULSE_LAYER_ID, "circle-opacity", opacity);
      selectedPulseFrameRef.current = requestAnimationFrame(animatePulse);
    };

    selectedPulseFrameRef.current = requestAnimationFrame(animatePulse);

    return () => {
      if (selectedPulseFrameRef.current !== null) {
        cancelAnimationFrame(selectedPulseFrameRef.current);
        selectedPulseFrameRef.current = null;
      }
    };
  }, [mapReady, selectedPlace?.id]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    ensureRouteLayers(map);

    if (routeDashFrameRef.current !== null) {
      cancelAnimationFrame(routeDashFrameRef.current);
      routeDashFrameRef.current = null;
    }

    if (!hasActiveRoute || prefersReducedMotionRef.current) {
      if (map.getLayer(ROUTE_ACTIVE_DASH_LAYER_ID)) {
        map.setPaintProperty(
          ROUTE_ACTIVE_DASH_LAYER_ID,
          "line-dasharray",
          ROUTE_DASH_SEQUENCE[0],
        );
      }
      return;
    }

    let step = -1;
    const animateRouteDash = (timestamp: number) => {
      if (!map.getLayer(ROUTE_ACTIVE_DASH_LAYER_ID)) {
        return;
      }

      const nextStep = Math.floor((timestamp / 80) % ROUTE_DASH_SEQUENCE.length);
      if (nextStep !== step) {
        map.setPaintProperty(
          ROUTE_ACTIVE_DASH_LAYER_ID,
          "line-dasharray",
          ROUTE_DASH_SEQUENCE[nextStep],
        );
        step = nextStep;
      }

      routeDashFrameRef.current = requestAnimationFrame(animateRouteDash);
    };

    routeDashFrameRef.current = requestAnimationFrame(animateRouteDash);

    return () => {
      if (routeDashFrameRef.current !== null) {
        cancelAnimationFrame(routeDashFrameRef.current);
        routeDashFrameRef.current = null;
      }
    };
  }, [hasActiveRoute, mapReady]);

  useEffect(() => {
    if (
      mode !== "trip" ||
      !mapReady ||
      !mapRef.current ||
      !selectedPlace ||
      !isValidLngLat(selectedPlace.lng, selectedPlace.lat)
    ) {
      if (!selectedPlace) {
        previousFlyToPlaceIdRef.current = null;
      }
      return;
    }

    if (previousFlyToPlaceIdRef.current === selectedPlace.id) {
      return;
    }

    previousFlyToPlaceIdRef.current = selectedPlace.id;
    const selectedCamera = {
      center: [selectedPlace.lng, selectedPlace.lat] as [number, number],
      zoom: getSelectedPlaceZoom(initialZoom),
      pitch: SELECTED_PLACE_PITCH,
      bearing: SELECTED_PLACE_BEARING,
    } satisfies Parameters<Map["jumpTo"]>[0];

    if (prefersReducedMotionRef.current) {
      mapRef.current.jumpTo(selectedCamera);
      return;
    }

    mapRef.current.flyTo({
      ...selectedCamera,
      offset: getSelectedPlaceOffset(),
      duration: 1400,
      essential: false,
    });
  }, [initialZoom, mapReady, mode, selectedPlace]);

  useEffect(() => {
    if (
      !mapReady ||
      !mapRef.current ||
      mode !== "trip" ||
      !selectedPlace ||
      !isValidLngLat(selectedPlace.lng, selectedPlace.lat)
    ) {
      setSelectedCalloutLayout(null);
      return;
    }

    const map = mapRef.current;
    const updateCallout = () => {
      const point = map.project([selectedPlace.lng, selectedPlace.lat]);
      const width = window.innerWidth < 640 ? 224 : 272;
      const height = window.innerWidth < 640 ? 126 : 132;
      const position = getMapCalloutPosition({
        marker: point,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        callout: {
          width,
          height,
        },
        margin: window.innerWidth < 768 ? 14 : 24,
        verticalGap: window.innerWidth < 640 ? 18 : 26,
      });

      setSelectedCalloutLayout({
        ...position,
        width,
        height,
        markerY: Math.round(point.y),
      });
    };

    updateCallout();
    map.on("move", updateCallout);
    map.on("resize", updateCallout);
    window.addEventListener("resize", updateCallout);

    return () => {
      map.off("move", updateCallout);
      map.off("resize", updateCallout);
      window.removeEventListener("resize", updateCallout);
    };
  }, [mapReady, mode, selectedPlace]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || mode !== "extracting" || places.length === 0) {
      return;
    }

    const bounds = getPlacesBounds(places);
    if (!bounds) {
      return;
    }

    const signature = places
      .map((place) => `${place.id}:${place.lng.toFixed(4)},${place.lat.toFixed(4)}`)
      .join("|");

    if (focusedPlaceSignatureRef.current === signature) {
      return;
    }

    focusedPlaceSignatureRef.current = signature;
    previousFlyToPlaceIdRef.current = null;

    const map = mapRef.current;
    const complete = () => {
      map.off("moveend", complete);
      onRegionFocusCompleteRef.current?.();
    };
    const padding = getRegionFocusPadding();

    if (prefersReducedMotionRef.current) {
      map.fitBounds(bounds, {
        padding,
        maxZoom: 12.8,
        duration: 0,
      });
      window.setTimeout(() => onRegionFocusCompleteRef.current?.(), 0);
      return;
    }

    map.once("moveend", complete);
    map.fitBounds(bounds, {
      padding,
      maxZoom: 12.8,
      duration: 2200,
      essential: false,
    });
  }, [mapReady, mode, places]);

  return (
    <>
      <div className="absolute inset-0 h-full w-full">
        <div
          ref={mapContainerRef}
          data-trip-map-container
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
        />
      </div>
      <div className="tc-map-vignette pointer-events-none absolute inset-0" />
      {mode !== "globe" && routeSourcePlaces.length > 0 ? (
        <div
          data-testid="extracted-reel-places-map-badge"
          className="pointer-events-none absolute left-1/2 top-5 z-10 hidden -translate-x-1/2 rounded-full border border-amber-200/35 bg-[#101821]/78 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-amber-100 shadow-2xl shadow-black/30 backdrop-blur-xl md:block"
        >
          Extracted Reel places / {routeSourcePlaces.length} pinned
        </div>
      ) : null}
      {hotelHubName ? (
        <div className="pointer-events-none absolute left-1/2 top-16 z-10 hidden -translate-x-1/2 rounded-full border border-cyan-100/25 bg-slate-950/72 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-100 shadow-2xl shadow-black/30 backdrop-blur-xl md:block">
          Base near {hotelHubName}
        </div>
      ) : null}
      {selectedPlace && selectedCalloutLayout ? (
        <div
          data-testid="selected-place-map-callout"
          className="pointer-events-none absolute z-20 rounded-lg border border-cyan-100/55 bg-slate-950/88 p-3 text-slate-50 shadow-2xl shadow-slate-950/35 backdrop-blur-xl"
          style={{
            left: selectedCalloutLayout.left,
            top: selectedCalloutLayout.top,
            width: selectedCalloutLayout.width,
            height: selectedCalloutLayout.height,
          }}
        >
          <span
            className={`absolute h-3 w-3 rotate-45 border-cyan-100/55 bg-slate-950/88 ${
              selectedCalloutLayout.top > selectedCalloutLayout.markerY
                ? "-top-1.5 border-l border-t"
                : "-bottom-1.5 border-b border-r"
            }`}
            style={{
              left: Math.min(
                Math.max(selectedCalloutLayout.anchorX - 6, 18),
                selectedCalloutLayout.width - 24,
              ),
            }}
          />
          <div className="relative space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">
                  {selectedPlace.name}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-cyan-300/18 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">
                    Day {selectedPlace.day}
                  </span>
                  <span className="rounded-full bg-amber-200/18 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-amber-100">
                    {selectedPlace.category}
                  </span>
                </div>
              </div>
              <span className="rounded-full border border-amber-100/45 bg-amber-200/18 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-100">
                Chosen
              </span>
            </div>
            <p
              className="text-[11px] font-semibold leading-snug text-slate-100"
              style={{
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 3,
                overflow: "hidden",
              }}
            >
              {selectedCalloutReason}
            </p>
            <p className="hidden text-[10px] font-semibold leading-snug text-cyan-100/82 sm:block">
              {selectedCalloutEvidence}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

function buildMapCalloutReason(place: TripPlace | null, day: TripDay | null) {
  if (!place) {
    return "";
  }

  return truncateMapText(
    place.plannerSummary ||
      place.summary ||
      place.dayPlanText ||
      day?.summary ||
      "The planner selected this stop from the extracted Reel signals.",
    116,
  );
}

function buildMapCalloutEvidence(place: TripPlace | null, day: TripDay | null) {
  if (!place) {
    return "";
  }

  if (place.evidenceQuote) {
    return truncateMapText(`Reel evidence: "${place.evidenceQuote}"`, 108);
  }

  if (typeof place.confidence === "number") {
    return `${Math.round(place.confidence * 100)}% extraction confidence.`;
  }

  if (place.dayPlanText) {
    return truncateMapText(place.dayPlanText, 108);
  }

  return truncateMapText(day?.weatherStrategy || "Open the agent panel for the full rationale.", 108);
}

function truncateMapText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function applyAtmosphere(map: Map, mode: TripMapMode) {
  try {
    if (mode === "trip") {
      map.setFog({
        color: "rgb(232, 242, 248)",
        "high-color": "rgb(188, 219, 235)",
        "horizon-blend": 0.08,
        "space-color": "rgb(246, 251, 255)",
        "star-intensity": 0,
      });
      return;
    }

    map.setFog({
      color: "rgb(15, 23, 42)",
      "high-color": "rgb(13, 148, 136)",
      "horizon-blend": 0.16,
      "space-color": "rgb(2, 6, 23)",
      "star-intensity": 0.38,
    });
  } catch {
    // Some Mapbox styles can reject fog options; the base map should still render.
  }
}

function getBasemapConfig(mode: TripMapMode) {
  if (mode === "trip") {
    return STANDARD_ARCHITECTURAL_BASEMAP_CONFIG;
  }

  return {
    ...STANDARD_ARCHITECTURAL_BASEMAP_CONFIG,
    lightPreset: "night",
    show3dBuildings: false,
    show3dFacades: false,
    show3dLandmarks: false,
    show3dTrees: false,
    showRoadLabels: false,
    showTransitLabels: false,
    showPedestrianRoads: false,
  };
}

function updatePlaceSource(map: Map, placeCollection: PlaceFeatureCollection) {
  const source = map.getSource(PLACE_SOURCE_ID);
  if (source && "setData" in source) {
    (source as GeoJSONSource).setData(placeCollection);
  }
}

function updateHotelHubSource(map: Map, hotelHubCollection: HotelHubFeatureCollection) {
  const source = map.getSource(HOTEL_HUB_SOURCE_ID);
  if (source && "setData" in source) {
    (source as GeoJSONSource).setData(hotelHubCollection);
  }
}

function registerPlaceInteractions(
  map: Map,
  prefersReducedMotionRef: { current: boolean },
  onSelectPlaceRef: { current: (placeId: string) => void },
) {
  map.on("click", PLACE_HITBOX_LAYER_ID, (event: MapLayerMouseEvent) => {
    const placeId = event.features?.[0]?.properties?.placeId;
    if (typeof placeId !== "string" || placeId.length === 0) {
      return;
    }

    event.preventDefault();
    onSelectPlaceRef.current(placeId);
  });

  map.on("click", PLACE_CLUSTER_HITBOX_LAYER_ID, (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    const clusterId = Number(feature?.properties?.cluster_id);
    const coordinates = feature ? getPointCoordinates(feature) : null;
    const source = map.getSource(PLACE_SOURCE_ID);

    if (
      !Number.isFinite(clusterId) ||
      !coordinates ||
      !source ||
      !("getClusterExpansionZoom" in source)
    ) {
      return;
    }

    event.preventDefault();
    (source as GeoJSONSource).getClusterExpansionZoom(clusterId, (error, zoom) => {
      if (error || zoom == null) {
        return;
      }

      const clusterCamera = {
        center: coordinates,
        zoom: Math.min(zoom + 0.35, 14.6),
        pitch: STANDARD_DAY_PITCH,
        bearing: STANDARD_DAY_BEARING,
      } satisfies Parameters<Map["jumpTo"]>[0];

      if (prefersReducedMotionRef.current) {
        map.jumpTo(clusterCamera);
        return;
      }

      map.easeTo({
        ...clusterCamera,
        duration: 900,
        essential: false,
      });
    });
  });

  [PLACE_HITBOX_LAYER_ID, PLACE_CLUSTER_HITBOX_LAYER_ID].forEach((layerId) => {
    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });
  });
}

function getPointCoordinates(feature: { geometry?: GeoJSON.Geometry | null }) {
  if (feature.geometry?.type !== "Point") {
    return null;
  }

  const [lng, lat] = feature.geometry.coordinates;
  return isValidLngLat(lng, lat) ? ([lng, lat] as [number, number]) : null;
}

function isValidLngLat(lng: unknown, lat: unknown) {
  return isValidLngLatValue(lng, lat);
}

function getInitialCameraZoom(initialZoom: number, mode: TripMapMode) {
  if (mode !== "trip") {
    return GLOBE_ZOOM;
  }

  return Math.min(Math.max(initialZoom + 0.85, 11.8), 13.2);
}

function getInitialCameraPitch(mode: TripMapMode) {
  return mode === "trip" ? STANDARD_DAY_PITCH : GLOBE_PITCH;
}

function getInitialCameraBearing(mode: TripMapMode) {
  return mode === "trip" ? STANDARD_DAY_BEARING : GLOBE_BEARING;
}

function getSelectedPlaceZoom(initialZoom: number) {
  return Math.min(Math.max(initialZoom + 4.25, 15.4), 16.4);
}

function getPlacesBounds(places: TripPlace[]) {
  const validPlaces = places.filter((place) => isValidLngLat(place.lng, place.lat));
  if (validPlaces.length === 0) {
    return null;
  }

  const lngs = validPlaces.map((place) => place.lng);
  const lats = validPlaces.map((place) => place.lat);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);

  if (minLng === maxLng) {
    minLng -= 0.018;
    maxLng += 0.018;
  }

  if (minLat === maxLat) {
    minLat -= 0.018;
    maxLat += 0.018;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ] as [[number, number], [number, number]];
}

function getRegionFocusPadding() {
  if (typeof window === "undefined") {
    return 120;
  }

  if (window.innerWidth < 768) {
    return {
      top: 144,
      right: 24,
      bottom: 124,
      left: 24,
    };
  }

  return {
    top: 84,
    right: 390,
    bottom: 116,
    left: 350,
  };
}

function getSelectedPlaceOffset(): [number, number] {
  if (typeof window === "undefined") {
    return [0, 0];
  }

  if (window.innerWidth < 1024) {
    return [0, -96];
  }

  return [0, 0];
}
