import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importDayRouteModule() {
  const source = await readFile(new URL("./day-route.ts", import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const encoded = Buffer.from(transpiled).toString("base64");

  return import(`data:text/javascript;base64,${encoded}#${Date.now()}`);
}

const dayRoute = await importDayRouteModule();

const dayOne = {
  day: 1,
  title: "Rain-soft arrival",
  summary: "Arrival day through Shiodome, Roppongi, and Midtown.",
  placeIds: ["grand-hyatt-tokyo"],
  stops: [
    {
      timeOfDay: "morning",
      name: "Hamarikyu Gardens",
      category: "attraction",
      isAnchor: false,
      description: "Stroll the tidal pond and matcha teahouse.",
    },
    {
      timeOfDay: "afternoon",
      name: "Grand Hyatt Tokyo",
      category: "hotel",
      isAnchor: true,
      placeName: "Grand Hyatt Tokyo",
      description: "Roppongi Hills hotel restaurants and lobby bar.",
    },
    {
      timeOfDay: "evening",
      name: "Tokyo Midtown",
      category: "shopping",
      isAnchor: false,
      description: "Dinner near Roppongi.",
    },
  ],
};

const places = [
  {
    id: "grand-hyatt-tokyo",
    name: "Grand Hyatt Tokyo",
    category: "hotel",
    day: 1,
    lat: 35.659426,
    lng: 139.729104,
    summary: "Extracted from a Reel.",
    confidence: 0.95,
  },
];

const hotelBase = {
  selectedBaseId: "shiodome",
  selectedBaseName: "Shiodome",
  selectedBaseRationale: "Best rail base.",
  selectedHotelId: "hotel-royal-park-shiodome",
  selectedHotelName: "The Royal Park Hotel Iconic Tokyo Shiodome",
  selectedHotelRationale: "Covered station access.",
  baseAreas: [],
  hotelCandidates: [
    {
      id: "hotel-royal-park-shiodome",
      name: "The Royal Park Hotel Iconic Tokyo Shiodome",
      baseAreaId: "shiodome",
      lat: 35.6655,
      lng: 139.7585,
      priceSummary: "Mid range.",
      rationale: "Best pick.",
      tradeoffs: [],
    },
  ],
};

test("buildDayRoutePlan resolves airport, selected hotel, supporting stops, and extracted places", () => {
  const plan = dayRoute.buildDayRoutePlan(dayOne, places, hotelBase);

  assert.deepEqual(
    plan.stops.map((stop) => stop.name),
    [
      "Narita Airport",
      "The Royal Park Hotel Iconic Tokyo Shiodome",
      "Hamarikyu Gardens",
      "Grand Hyatt Tokyo",
      "Tokyo Midtown",
    ],
  );
  assert.equal(plan.stops[0].kind, "airport");
  assert.equal(plan.stops[1].kind, "selected-hotel");
  assert.equal(plan.stops[2].kind, "known-supporting-stop");
  assert.equal(plan.stops[3].kind, "extracted-place");
  assert.equal(plan.stops[4].kind, "known-supporting-stop");
  assert.equal(plan.waypoints.length, 5);
  assert.equal(plan.legs.length, 4);
  assert.ok(plan.signature.includes("day-1"));
});

test("buildDayRoutePlan breaks the route into one-location-to-one-location legs", () => {
  const plan = dayRoute.buildDayRoutePlan(dayOne, places, hotelBase);

  assert.deepEqual(
    plan.legs.map((leg) => [leg.sequence, leg.from.name, leg.to.name]),
    [
      [1, "Narita Airport", "The Royal Park Hotel Iconic Tokyo Shiodome"],
      [2, "The Royal Park Hotel Iconic Tokyo Shiodome", "Hamarikyu Gardens"],
      [3, "Hamarikyu Gardens", "Grand Hyatt Tokyo"],
      [4, "Grand Hyatt Tokyo", "Tokyo Midtown"],
    ],
  );
  assert.deepEqual(plan.legs[0].waypoints, [plan.waypoints[0], plan.waypoints[1]]);
  assert.ok(plan.legs.every((leg) => leg.signature.includes(`day-1-leg-${leg.sequence}`)));
});

test("findRouteLegForPlace returns the single inbound leg for a selected place", () => {
  const plan = dayRoute.buildDayRoutePlan(dayOne, places, hotelBase);
  const leg = dayRoute.findRouteLegForPlace(plan, places[0]);

  assert.equal(leg.sequence, 3);
  assert.equal(leg.from.name, "Hamarikyu Gardens");
  assert.equal(leg.to.name, "Grand Hyatt Tokyo");
});

test("buildFallbackRouteCoordinates bends between waypoints instead of drawing only direct chords", () => {
  const plan = dayRoute.buildDayRoutePlan(dayOne, places, hotelBase);
  const fallback = dayRoute.buildFallbackRouteCoordinates(plan.stops);

  assert.ok(fallback.length > plan.waypoints.length);
  assert.deepEqual(fallback[0], plan.waypoints[0]);
  assert.deepEqual(fallback.at(-1), plan.waypoints.at(-1));
});

test("buildMapboxDirectionsUrl requests full GeoJSON route geometry", () => {
  const plan = dayRoute.buildDayRoutePlan(dayOne, places, hotelBase);
  const url = dayRoute.buildMapboxDirectionsUrl(plan.waypoints, "pk.test-token");

  assert.ok(url.startsWith("https://api.mapbox.com/directions/v5/mapbox/driving/"));
  assert.ok(url.includes("geometries=geojson"));
  assert.ok(url.includes("overview=full"));
  assert.ok(url.includes("access_token=pk.test-token"));
});
