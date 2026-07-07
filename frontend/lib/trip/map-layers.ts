import type { AnyLayer, ExpressionSpecification, Map } from "mapbox-gl";
import {
  EMPTY_HOTEL_HUB_COLLECTION,
  EMPTY_PLACE_COLLECTION,
  EMPTY_ROUTE_COLLECTION,
  EMPTY_ROUTE_STOP_COLLECTION,
} from "@/lib/trip/map-feature-collections";
import { buildActiveAwareLineWidth } from "@/lib/trip/map-style";

export const RELIABLE_BUILDINGS_LAYER_ID = "astrail-reliable-3d-buildings";
export const ROUTE_SOURCE_ID = "astrail-routes";
export const ROUTE_CASING_LAYER_ID = "astrail-routes-casing";
export const ROUTE_UNDERLAY_LAYER_ID = "astrail-routes-underlay";
export const ROUTE_ACTIVE_LAYER_ID = "astrail-routes-active";
export const ROUTE_ACTIVE_DASH_LAYER_ID = "astrail-routes-active-dash";
export const ROUTE_STOP_SOURCE_ID = "astrail-route-stops";
export const ROUTE_STOP_HALO_LAYER_ID = "astrail-route-stop-halos";
export const ROUTE_STOP_NUMBER_LAYER_ID = "astrail-route-stop-numbers";
export const ROUTE_STOP_LABEL_LAYER_ID = "astrail-route-stop-labels";
export const PLACE_SOURCE_ID = "astrail-places";
export const PLACE_CLUSTER_LAYER_ID = "astrail-place-clusters";
export const PLACE_CLUSTER_COUNT_LAYER_ID = "astrail-place-cluster-counts";
export const PLACE_CLUSTER_HITBOX_LAYER_ID = "astrail-place-cluster-hitbox";
export const PLACE_SELECTED_PULSE_LAYER_ID = "astrail-place-selected-pulse";
export const PLACE_HALO_LAYER_ID = "astrail-place-halos";
export const PLACE_DOT_LAYER_ID = "astrail-place-dots";
export const PLACE_GLYPH_LAYER_ID = "astrail-place-glyphs";
export const PLACE_HITBOX_LAYER_ID = "astrail-place-hitbox";
export const HOTEL_HUB_SOURCE_ID = "astrail-hotel-hub";
export const HOTEL_HUB_HALO_LAYER_ID = "astrail-hotel-hub-halo";
export const HOTEL_HUB_DOT_LAYER_ID = "astrail-hotel-hub-dot";
export const HOTEL_HUB_RING_LAYER_ID = "astrail-hotel-hub-ring";
export const HOTEL_HUB_GLYPH_LAYER_ID = "astrail-hotel-hub-glyph";
export const HOTEL_HUB_LABEL_LAYER_ID = "astrail-hotel-hub-label";

export const ROUTE_DASH_SEQUENCE: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

export function addReliable3DBuildingsLayer(map: Map) {
  if (map.getLayer(RELIABLE_BUILDINGS_LAYER_ID)) {
    return;
  }

  const hasCompositeSource = Boolean(map.getStyle().sources?.composite);
  if (!hasCompositeSource) {
    return;
  }

  const buildingLayer: AnyLayer = {
    id: RELIABLE_BUILDINGS_LAYER_ID,
    source: "composite",
    "source-layer": "building",
    filter: ["==", ["get", "extrude"], "true"],
    type: "fill-extrusion",
    minzoom: 13.4,
    slot: "middle",
    paint: {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["get", "height"],
        0,
        "#f4efe6",
        90,
        "#e8dfcf",
        180,
        "#d5c3a8",
        280,
        "#b9d7e8",
      ],
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["zoom"],
        13.4,
        0,
        15.4,
        ["coalesce", ["get", "height"], 12],
      ],
      "fill-extrusion-base": [
        "interpolate",
        ["linear"],
        ["zoom"],
        13.4,
        0,
        15.4,
        ["coalesce", ["get", "min_height"], 0],
      ],
      "fill-extrusion-opacity": 0.74,
      "fill-extrusion-vertical-gradient": true,
      "fill-extrusion-emissive-strength": 0.05,
    },
  };

  try {
    map.addLayer(buildingLayer);
  } catch {
    // Some Mapbox Standard imports may hide the raw building source; the map stays usable.
  }
}

export function ensureRouteLayers(map: Map) {
  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_ROUTE_COLLECTION,
      lineMetrics: true,
    });
  }

  if (!map.getLayer(ROUTE_CASING_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_CASING_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      slot: "top",
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": [
          "case",
          ["boolean", ["get", "active"], false],
          "rgba(15, 23, 42, 0.74)",
          "rgba(15, 23, 42, 0.3)",
        ],
        "line-width": buildActiveAwareLineWidth({
          zoomStops: [
            [10, 9, 3.5],
            [14, 16, 6],
            [16, 21, 8],
          ],
        }),
        "line-opacity": [
          "case",
          ["boolean", ["get", "active"], false],
          0.76,
          0.08,
        ],
        "line-blur": 0.7,
        "line-emissive-strength": 0.2,
      },
    });
  }

  if (!map.getLayer(ROUTE_UNDERLAY_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_UNDERLAY_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      slot: "top",
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": [
          "case",
          ["boolean", ["get", "active"], false],
          "rgba(34, 211, 238, 0.7)",
          "rgba(20, 184, 166, 0.2)",
        ],
        "line-width": buildActiveAwareLineWidth({
          zoomStops: [
            [10, 6.4, 2.5],
            [14, 11.5, 4.2],
            [16, 15, 6],
          ],
        }),
        "line-opacity": [
          "case",
          ["boolean", ["get", "active"], false],
          0.86,
          0.1,
        ],
        "line-blur": 1.2,
        "line-emissive-strength": 0.5,
      },
    });
  }

  if (!map.getLayer(ROUTE_ACTIVE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_ACTIVE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      slot: "top",
      filter: ["==", ["get", "active"], true],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#22d3ee",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4.8, 14, 8, 16, 10],
        "line-opacity": 0.96,
        "line-emissive-strength": 0.78,
      },
    });
  }

  if (!map.getLayer(ROUTE_ACTIVE_DASH_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_ACTIVE_DASH_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      slot: "top",
      filter: ["==", ["get", "active"], true],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#fef3c7",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.8, 14, 3, 16, 4],
        "line-opacity": 0.92,
        "line-dasharray": ROUTE_DASH_SEQUENCE[0],
        "line-emissive-strength": 0.9,
      },
    });
  }
}

export function ensureRouteStopLayers(map: Map) {
  if (!map.getSource(ROUTE_STOP_SOURCE_ID)) {
    map.addSource(ROUTE_STOP_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_ROUTE_STOP_COLLECTION,
    });
  }

  const routeStopHaloLayer: AnyLayer = {
    id: ROUTE_STOP_HALO_LAYER_ID,
    type: "circle",
    source: ROUTE_STOP_SOURCE_ID,
    slot: "top",
    paint: {
      "circle-color": [
        "case",
        ["boolean", ["get", "active"], false],
        [
          "match",
          ["get", "kind"],
          "airport",
          "#60a5fa",
          "selected-hotel",
          "#67e8f9",
          "extracted-place",
          "#fde68a",
          "#c4b5fd",
        ],
        "rgba(148, 163, 184, 0.7)",
      ],
      "circle-radius": [
        "case",
        ["boolean", ["get", "active"], false],
        15,
        10,
      ],
      "circle-opacity": [
        "case",
        ["boolean", ["get", "active"], false],
        0.88,
        0.36,
      ],
      "circle-stroke-color": "rgba(15, 23, 42, 0.82)",
      "circle-stroke-width": 2,
      "circle-blur": 0.04,
      "circle-emissive-strength": 0.32,
    },
  };

  const routeStopNumberLayer: AnyLayer = {
    id: ROUTE_STOP_NUMBER_LAYER_ID,
    type: "symbol",
    source: ROUTE_STOP_SOURCE_ID,
    slot: "top",
    layout: {
      "text-field": ["to-string", ["get", "sequence"]],
      "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
      "text-size": [
        "case",
        ["boolean", ["get", "active"], false],
        11,
        9,
      ],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "rgba(2, 6, 23, 0.92)",
      "text-emissive-strength": 0.22,
    },
  };

  const routeStopLabelLayer: AnyLayer = {
    id: ROUTE_STOP_LABEL_LAYER_ID,
    type: "symbol",
    source: ROUTE_STOP_SOURCE_ID,
    slot: "top",
    filter: ["==", ["get", "active"], true],
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
      "text-size": 11,
      "text-offset": [0, 1.55],
      "text-anchor": "top",
      "text-max-width": 9,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#f8fafc",
      "text-halo-color": "rgba(15, 23, 42, 0.84)",
      "text-halo-width": 1.4,
      "text-emissive-strength": 0.32,
    },
  };

  [routeStopHaloLayer, routeStopNumberLayer, routeStopLabelLayer].forEach((layer) => {
    if (!map.getLayer(layer.id)) {
      map.addLayer(layer);
    }
  });
}

export function ensurePlaceLayers(map: Map) {
  if (!map.getSource(PLACE_SOURCE_ID)) {
    map.addSource(PLACE_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_PLACE_COLLECTION,
      cluster: true,
      clusterRadius: 80,
      clusterMaxZoom: 11,
      clusterMinPoints: 2,
    });
  }

  const clusterLayer: AnyLayer = {
    id: PLACE_CLUSTER_LAYER_ID,
    type: "circle",
    source: PLACE_SOURCE_ID,
    slot: "top",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#fde68a",
        4,
        "#facc15",
        8,
        "#fb923c",
      ],
      "circle-radius": ["step", ["get", "point_count"], 23, 4, 28, 8, 34],
      "circle-opacity": 0.94,
      "circle-stroke-color": "rgba(15, 23, 42, 0.76)",
      "circle-stroke-width": 2,
      "circle-blur": 0.02,
      "circle-emissive-strength": 0.18,
    },
  };

  const clusterCountLayer: AnyLayer = {
    id: PLACE_CLUSTER_COUNT_LAYER_ID,
    type: "symbol",
    source: PLACE_SOURCE_ID,
    slot: "top",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
      "text-size": 13,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "rgba(3, 7, 18, 0.92)",
      "text-emissive-strength": 0.25,
    },
  };

  const clusterHitboxLayer: AnyLayer = {
    id: PLACE_CLUSTER_HITBOX_LAYER_ID,
    type: "circle",
    source: PLACE_SOURCE_ID,
    slot: "top",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#ffffff",
      "circle-radius": ["step", ["get", "point_count"], 31, 4, 37, 8, 44],
      "circle-opacity": 0.01,
    },
  };

  const placeSelectedPulseLayer: AnyLayer = {
    id: PLACE_SELECTED_PULSE_LAYER_ID,
    type: "circle",
    source: PLACE_SOURCE_ID,
    slot: "top",
    filter: [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "selected"], true],
    ],
    paint: {
      "circle-color": "#22d3ee",
      "circle-radius": 32,
      "circle-opacity": 0.2,
      "circle-stroke-color": "#fef3c7",
      "circle-stroke-width": 2,
      "circle-blur": 0.28,
      "circle-emissive-strength": 0.58,
    },
  };

  const placeHaloLayer: AnyLayer = {
    id: PLACE_HALO_LAYER_ID,
    type: "circle",
    source: PLACE_SOURCE_ID,
    slot: "top",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": placeColorExpression(),
      "circle-radius": [
        "case",
        ["boolean", ["get", "selected"], false],
        34,
        ["boolean", ["get", "muted"], false],
        9,
        18,
      ],
      "circle-opacity": [
        "case",
        ["boolean", ["get", "selected"], false],
        0.54,
        ["boolean", ["get", "muted"], false],
        0.04,
        0.2,
      ],
      "circle-blur": 0.42,
      "circle-emissive-strength": 0.32,
    },
  };

  const placeDotLayer: AnyLayer = {
    id: PLACE_DOT_LAYER_ID,
    type: "circle",
    source: PLACE_SOURCE_ID,
    slot: "top",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": placeColorExpression(),
      "circle-radius": [
        "case",
        ["boolean", ["get", "selected"], false],
        15,
        ["boolean", ["get", "muted"], false],
        4.8,
        8.5,
      ],
      "circle-stroke-color": [
        "case",
        ["boolean", ["get", "selected"], false],
        "#fef3c7",
        ["boolean", ["get", "muted"], false],
        "rgba(255, 255, 255, 0.36)",
        "rgba(255, 255, 255, 0.96)",
      ],
      "circle-stroke-width": [
        "case",
        ["boolean", ["get", "selected"], false],
        6,
        ["boolean", ["get", "muted"], false],
        1.5,
        5,
      ],
      "circle-opacity": [
        "case",
        ["boolean", ["get", "selected"], false],
        1,
        ["boolean", ["get", "muted"], false],
        0.2,
        0.98,
      ],
      "circle-emissive-strength": 0.38,
    },
  };

  const placeGlyphLayer: AnyLayer = {
    id: PLACE_GLYPH_LAYER_ID,
    type: "symbol",
    source: PLACE_SOURCE_ID,
    slot: "top",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "text-field": ["get", "glyph"],
      "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
      "text-size": [
        "case",
        ["boolean", ["get", "selected"], false],
        13,
        ["boolean", ["get", "muted"], false],
        8,
        10.5,
      ],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "rgba(3, 7, 18, 0.9)",
      "text-opacity": [
        "case",
        ["boolean", ["get", "selected"], false],
        1,
        ["boolean", ["get", "muted"], false],
        0.22,
        0.9,
      ],
      "text-emissive-strength": 0.18,
    },
  };

  const placeHitboxLayer: AnyLayer = {
    id: PLACE_HITBOX_LAYER_ID,
    type: "circle",
    source: PLACE_SOURCE_ID,
    slot: "top",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "#ffffff",
      "circle-radius": 24,
      "circle-opacity": 0.01,
    },
  };

  [
    clusterLayer,
    clusterCountLayer,
    clusterHitboxLayer,
    placeSelectedPulseLayer,
    placeHaloLayer,
    placeDotLayer,
    placeGlyphLayer,
    placeHitboxLayer,
  ].forEach((layer) => {
    if (!map.getLayer(layer.id)) {
      map.addLayer(layer);
    }
  });
}

export function ensureHotelHubLayers(map: Map) {
  if (!map.getSource(HOTEL_HUB_SOURCE_ID)) {
    map.addSource(HOTEL_HUB_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_HOTEL_HUB_COLLECTION,
    });
  }

  const hotelHubHaloLayer: AnyLayer = {
    id: HOTEL_HUB_HALO_LAYER_ID,
    type: "circle",
    source: HOTEL_HUB_SOURCE_ID,
    slot: "top",
    paint: {
      "circle-color": "#22d3ee",
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 28, 15, 48],
      "circle-opacity": 0.3,
      "circle-blur": 0.55,
      "circle-emissive-strength": 0.42,
    },
  };

  const hotelHubRingLayer: AnyLayer = {
    id: HOTEL_HUB_RING_LAYER_ID,
    type: "circle",
    source: HOTEL_HUB_SOURCE_ID,
    slot: "top",
    paint: {
      "circle-color": "rgba(15, 23, 42, 0.76)",
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 17, 15, 24],
      "circle-stroke-color": "#fde68a",
      "circle-stroke-width": 5,
      "circle-opacity": 0.96,
      "circle-emissive-strength": 0.28,
    },
  };

  const hotelHubDotLayer: AnyLayer = {
    id: HOTEL_HUB_DOT_LAYER_ID,
    type: "circle",
    source: HOTEL_HUB_SOURCE_ID,
    slot: "top",
    paint: {
      "circle-color": "#67e8f9",
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 9, 15, 13],
      "circle-stroke-color": "rgba(15, 23, 42, 0.94)",
      "circle-stroke-width": 3,
      "circle-opacity": 0.98,
      "circle-emissive-strength": 0.38,
    },
  };

  const hotelHubGlyphLayer: AnyLayer = {
    id: HOTEL_HUB_GLYPH_LAYER_ID,
    type: "symbol",
    source: HOTEL_HUB_SOURCE_ID,
    slot: "top",
    layout: {
      "text-field": ["get", "glyph"],
      "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
      "text-size": 12,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "rgba(3, 7, 18, 0.92)",
      "text-emissive-strength": 0.24,
    },
  };

  const hotelHubLabelLayer: AnyLayer = {
    id: HOTEL_HUB_LABEL_LAYER_ID,
    type: "symbol",
    source: HOTEL_HUB_SOURCE_ID,
    slot: "top",
    layout: {
      "text-field": ["concat", "BASE  ", ["get", "name"]],
      "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
      "text-size": 11,
      "text-offset": [0, -3.1],
      "text-anchor": "bottom",
      "text-allow-overlap": false,
      "text-ignore-placement": false,
      "text-max-width": 16,
    },
    paint: {
      "text-color": "#fef3c7",
      "text-halo-color": "rgba(3, 7, 18, 0.9)",
      "text-halo-width": 1.8,
      "text-emissive-strength": 0.26,
    },
  };

  [
    hotelHubHaloLayer,
    hotelHubRingLayer,
    hotelHubDotLayer,
    hotelHubGlyphLayer,
    hotelHubLabelLayer,
  ].forEach((layer) => {
    if (!map.getLayer(layer.id)) {
      map.addLayer(layer);
    }
  });
}

function placeColorExpression(): ExpressionSpecification {
  return [
    "case",
    ["boolean", ["get", "selected"], false],
    "#fde68a",
    [
      "match",
      ["get", "category"],
      ["hotel", "transport", "station"],
      "#67e8f9",
      ["restaurant", "market"],
      "#fb923c",
      ["temple", "shrine", "landmark", "attraction"],
      "#fde68a",
      "#facc15",
    ],
  ] as ExpressionSpecification;
}
